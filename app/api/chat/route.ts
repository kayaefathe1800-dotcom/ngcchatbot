import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type IncomingMessage = {
  role: "assistant" | "user";
  content: string;
};

type RequestDocument = {
  name: string;
  text: string;
};

type Chunk = {
  title: string;
  text: string;
  score: number;
};

const FALLBACK_MESSAGE = "資料に記載がありません。";
const MAX_CHUNKS = 6;
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;
const MAX_HISTORY_MESSAGES = 8;

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function stripTranscriptNoise(value: string) {
  return normalizeText(value)
    .replace(/^WEBVTT\s*/i, "")
    .replace(/^\d+\s*$/gm, "")
    .replace(/^\d{2}:\d{2}:\d{2}\.\d+\s+-->\s+\d{2}:\d{2}:\d{2}\.\d+\s*$/gm, "")
    .replace(/[^\S\r\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(value: string) {
  const tokens = value.match(/[一-龯ぁ-んァ-ヴーA-Za-z0-9]{2,}/g) ?? [];
  return [...new Set(tokens.map((token) => token.toLowerCase()))];
}

function scoreChunk(query: string, chunk: string) {
  const queryTokens = tokenize(query);
  const normalizedChunk = chunk.toLowerCase();

  if (queryTokens.length === 0) {
    return 0;
  }

  let score = 0;

  for (const token of queryTokens) {
    if (normalizedChunk.includes(token)) {
      score += token.length > 3 ? 3 : 2;
    }
  }

  if (normalizedChunk.includes(query.trim().toLowerCase())) {
    score += 4;
  }

  return score;
}

function chunkText(title: string, rawText: string) {
  const text = stripTranscriptNoise(rawText);
  const chunks: Chunk[] = [];

  for (let start = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const slice = text.slice(start, start + CHUNK_SIZE).trim();

    if (!slice) {
      continue;
    }

    chunks.push({
      title,
      text: slice,
      score: 0
    });
  }

  return chunks;
}

function loadSeedDocuments(selectedNames?: string[]) {
  const directory = join(process.cwd(), "data", "documents");
  const fileNames = readdirSync(directory).filter(
    (fileName) => !selectedNames || selectedNames.includes(fileName)
  );

  return fileNames.map((fileName) => ({
    name: fileName,
    text: readFileSync(join(directory, fileName), "utf8")
  }));
}

function selectRelevantChunks(question: string, documents: RequestDocument[]) {
  return documents
    .flatMap((document) => chunkText(document.name, document.text))
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(question, chunk.text)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_CHUNKS);
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY が未設定です。Vercelの環境変数を設定してください。" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      messages?: IncomingMessage[];
      selectedSeedDocumentNames?: string[];
      uploadedDocuments?: RequestDocument[];
      presidentTone?: boolean;
    };

    const messages = body.messages ?? [];
    const selectedSeedDocumentNames = body.selectedSeedDocumentNames ?? [];
    const uploadedDocuments = body.uploadedDocuments ?? [];
    const presidentTone = Boolean(body.presidentTone);
    const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

    if (!latestUserMessage?.content.trim()) {
      return NextResponse.json({ error: "質問内容が空です。" }, { status: 400 });
    }

    const combinedDocuments = [
      ...loadSeedDocuments(selectedSeedDocumentNames),
      ...uploadedDocuments
    ]
      .filter((document) => document.text.trim())
      .map((document) => ({
        name: document.name,
        text: document.text.slice(0, 120000)
      }));

    if (combinedDocuments.length === 0) {
      return NextResponse.json({
        answer: FALLBACK_MESSAGE,
        sources: []
      });
    }

    const relevantChunks = selectRelevantChunks(latestUserMessage.content, combinedDocuments);

    if (relevantChunks.length === 0) {
      return NextResponse.json({
        answer: FALLBACK_MESSAGE,
        sources: []
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const contextBlock = relevantChunks
      .map((chunk, index) => `【資料${index + 1}: ${chunk.title}】\n${chunk.text}`)
      .join("\n\n");

    const recentConversation = messages
      .slice(-MAX_HISTORY_MESSAGES)
      .map((message) => `${message.role === "user" ? "ユーザー" : "アシスタント"}: ${message.content}`)
      .join("\n");

    const systemPrompt = [
      "あなたは社内向けの資料ベースチャットボットです。",
      "必ず提供された資料抜粋だけを根拠に、日本語で簡潔に回答してください。",
      "資料に明示されていない内容は推測してはいけません。",
      `根拠が不足している場合は、必ず「${FALLBACK_MESSAGE}」とだけ答えてください。`,
      "必要に応じて箇条書きを使ってください。",
      presidentTone
        ? "話し方だけは社長らしく落ち着いた口調で構いませんが、内容は必ず資料優先です。"
        : "話し方は端的でわかりやすいビジネス文体にしてください。"
    ].join("\n");

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            "以下は直近の会話履歴です。",
            recentConversation || "履歴なし",
            "",
            "以下は回答に使ってよい資料抜粋です。",
            contextBlock,
            "",
            `質問: ${latestUserMessage.content}`
          ].join("\n")
        }
      ],
      temperature: 0.1
    });

    const answer = response.output_text.trim() || FALLBACK_MESSAGE;

    return NextResponse.json({
      answer,
      sources: relevantChunks.map((chunk) => ({
        title: chunk.title,
        excerpt: `${chunk.text.slice(0, 120).trim()}${chunk.text.length > 120 ? "..." : ""}`
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
