"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatRole = "assistant" | "user";

type SourceReference = {
  title: string;
  excerpt: string;
};

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  sources?: SourceReference[];
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type UploadedDocument = {
  id: string;
  name: string;
  text: string;
  kind: "pdf" | "text";
  enabled: boolean;
};

type SeedDocument = {
  id: string;
  name: string;
  enabled: boolean;
};

const SESSIONS_STORAGE_KEY = "president-doc-chat-sessions";
const ACTIVE_SESSION_STORAGE_KEY = "president-doc-chat-active-session";
const TONE_STORAGE_KEY = "president-doc-chat-tone";
const MAX_DOCUMENT_CHARACTERS = 80000;

const INITIAL_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "資料ベースで回答します。知りたいことを入力してください。資料に根拠がない場合は「資料に記載がありません」とお伝えします。"
};

const INITIAL_SEED_DOCUMENTS: SeedDocument[] = [
  {
    id: "seed-1",
    name: "4月研修文字起こしデータ.txt",
    enabled: true
  }
];

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createSession(messages: ChatMessage[] = [INITIAL_MESSAGE]): ChatSession {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "新しい会話",
    updatedAt: now,
    messages
  };
}

function getSessionTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return "新しい会話";
  }

  return firstUserMessage.content.replace(/\s+/g, " ").slice(0, 28) || "新しい会話";
}

function formatSessionDate(value: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return "";
  }
}

async function extractTextFromFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "txt" || extension === "md" || extension === "csv") {
    return {
      text: (await file.text()).trim(),
      kind: "text" as const
    };
  }

  if (extension === "pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;

    const pages: string[] = [];

    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) {
        pages.push(pageText);
      }
    }

    return {
      text: pages.join("\n\n").trim(),
      kind: "pdf" as const
    };
  }

  throw new Error("対応していないファイル形式です。PDFまたはテキスト資料を選択してください。");
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [input, setInput] = useState("");
  const [seedDocuments, setSeedDocuments] = useState(INITIAL_SEED_DOCUMENTS);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [presidentTone, setPresidentTone] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const savedSessions = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
      const savedActiveSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      const savedTone = window.localStorage.getItem(TONE_STORAGE_KEY);

      const parsedSessions = savedSessions ? (JSON.parse(savedSessions) as ChatSession[]) : [];
      const safeSessions =
        Array.isArray(parsedSessions) && parsedSessions.length > 0
          ? parsedSessions
          : [createSession()];

      const initialActiveSessionId =
        savedActiveSessionId && safeSessions.some((session) => session.id === savedActiveSessionId)
          ? savedActiveSessionId
          : safeSessions[0].id;

      setChatSessions(safeSessions);
      setActiveSessionId(initialActiveSessionId);
      setMessages(
        safeSessions.find((session) => session.id === initialActiveSessionId)?.messages ?? [
          INITIAL_MESSAGE
        ]
      );

      if (savedTone) {
        setPresidentTone(savedTone === "true");
      }
    } catch {
      const fallbackSession = createSession();
      setChatSessions([fallbackSession]);
      setActiveSessionId(fallbackSession.id);
      setMessages(fallbackSession.messages);
      window.localStorage.removeItem(SESSIONS_STORAGE_KEY);
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(TONE_STORAGE_KEY);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated || !activeSessionId) {
      return;
    }

    setChatSessions((current) => {
      const updated = current.map((session) =>
        session.id === activeSessionId
          ? {
              ...session,
              title: getSessionTitle(messages),
              updatedAt: new Date().toISOString(),
              messages
            }
          : session
      );

      return updated.sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    });
  }, [activeSessionId, isHydrated, messages]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(chatSessions));
  }, [chatSessions, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !activeSessionId) {
      return;
    }

    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSessionId);
  }, [activeSessionId, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(TONE_STORAGE_KEY, String(presidentTone));
  }, [isHydrated, presidentTone]);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  const totalDocumentCount = seedDocuments.length + uploadedDocuments.length;
  const enabledDocumentCount =
    seedDocuments.filter((document) => document.enabled).length +
    uploadedDocuments.filter((document) => document.enabled).length;

  const documentCountLabel = useMemo(
    () => `${enabledDocumentCount}件を使用中 / 全${totalDocumentCount}件`,
    [enabledDocumentCount, totalDocumentCount]
  );

  const startNewChat = () => {
    const nextSession = createSession();
    setChatSessions((current) => [nextSession, ...current]);
    setActiveSessionId(nextSession.id);
    setMessages(nextSession.messages);
    setErrorMessage("");
    setInput("");
  };

  const switchSession = (sessionId: string) => {
    if (sessionId === activeSessionId) {
      return;
    }

    const selectedSession = chatSessions.find((session) => session.id === sessionId);

    if (!selectedSession) {
      return;
    }

    setActiveSessionId(selectedSession.id);
    setMessages(selectedSession.messages);
    setErrorMessage("");
    setInput("");
  };

  const deleteSession = (sessionId: string) => {
    const remainingSessions = chatSessions.filter((session) => session.id !== sessionId);

    if (remainingSessions.length === 0) {
      const nextSession = createSession();
      setChatSessions([nextSession]);
      setActiveSessionId(nextSession.id);
      setMessages(nextSession.messages);
      return;
    }

    setChatSessions(remainingSessions);

    if (sessionId === activeSessionId) {
      const nextSession = remainingSessions[0];
      setActiveSessionId(nextSession.id);
      setMessages(nextSession.messages);
    }
  };

  const onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const content = input.trim();

    if (!content || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsSending(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent
          })),
          selectedSeedDocumentNames: seedDocuments
            .filter((document) => document.enabled)
            .map((document) => document.name),
          uploadedDocuments: uploadedDocuments
            .filter((document) => document.enabled)
            .map(({ name, text }) => ({
              name,
              text
            })),
          presidentTone
        })
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        sources?: SourceReference[];
      };

      if (!response.ok || !data.answer) {
        throw new Error(data.error ?? "回答の生成に失敗しました。");
      }

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: data.answer!,
          sources: data.sources
        }
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "通信エラーが発生しました。時間をおいて再度お試しください。";

      setErrorMessage(message);
      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: "回答を生成できませんでした。設定を確認して、もう一度お試しください。"
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  };

  const onUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    setErrorMessage("");

    try {
      const extracted = await Promise.all(
        files.map(async (file) => {
          const { text, kind } = await extractTextFromFile(file);
          const normalized = text.replace(/\u0000/g, "").trim();

          if (!normalized) {
            throw new Error(`${file.name} からテキストを抽出できませんでした。`);
          }

          return {
            id: createId(),
            name: file.name,
            text: normalized.slice(0, MAX_DOCUMENT_CHARACTERS),
            kind,
            enabled: true
          } satisfies UploadedDocument;
        })
      );

      setUploadedDocuments((current) => {
        const deduped = current.filter(
          (document) => !extracted.some((incoming) => incoming.name === document.name)
        );

        return [...deduped, ...extracted];
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "資料のアップロードに失敗しました。別のファイルでお試しください。"
      );
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const toggleSeedDocument = (id: string) => {
    setSeedDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, enabled: !document.enabled } : document
      )
    );
  };

  const toggleUploadedDocument = (id: string) => {
    setUploadedDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, enabled: !document.enabled } : document
      )
    );
  };

  const removeDocument = (id: string) => {
    setUploadedDocuments((current) => current.filter((document) => document.id !== id));
  };

  const resetChat = () => {
    setMessages([INITIAL_MESSAGE]);
    setErrorMessage("");
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Document-Grounded Internal Chat</p>
          <h1>社長資料チャットボット</h1>
          <p className="hero-copy">
            社内資料だけを根拠に答える、日本語対応の社内向けチャットボットです。資料にない内容は
            推測せず、「資料に記載がありません」と返します。
          </p>
        </div>

        <div className="hero-actions">
          <label className="toggle-card">
            <input
              type="checkbox"
              checked={presidentTone}
              onChange={(event) => setPresidentTone(event.target.checked)}
            />
            <span>
              <strong>社長らしい口調</strong>
              <small>内容は資料優先のまま、言い回しだけ調整します</small>
            </span>
          </label>

          <button type="button" className="ghost-button" onClick={resetChat}>
            現在の会話をリセット
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        <aside className="sidebar-card">
          <div className="sidebar-section">
            <div className="history-header">
              <div>
                <p className="section-label">History</p>
                <h2>保存済みチャット</h2>
              </div>
              <button type="button" className="upload-button" onClick={startNewChat}>
                新しい会話
              </button>
            </div>

            <div className="history-list">
              {chatSessions.map((session) => (
                <article
                  key={session.id}
                  className={
                    session.id === activeSessionId ? "history-item is-active" : "history-item"
                  }
                >
                  <button
                    type="button"
                    className="history-select"
                    onClick={() => switchSession(session.id)}
                  >
                    <strong>{session.title}</strong>
                    <span>{formatSessionDate(session.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    className="history-delete"
                    onClick={() => deleteSession(session.id)}
                    aria-label={`${session.title} を削除`}
                  >
                    削除
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <div>
                <p className="section-label">Documents</p>
                <h2>{documentCountLabel}</h2>
              </div>
              <button
                type="button"
                className="upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? "読み込み中..." : "資料を追加"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.csv"
                multiple
                hidden
                onChange={onUpload}
              />
            </div>

            <p className="sidebar-copy">
              各資料カードの下にある操作ボタンから、使用するかどうかを切り替えられます。アップロードした
              資料は削除もできます。
            </p>

            <div className="document-list">
              {seedDocuments.map((document) => (
                <article
                  key={document.id}
                  className={document.enabled ? "document-chip is-seed" : "document-chip is-muted"}
                >
                  <label className="document-check">
                    <input
                      type="checkbox"
                      checked={document.enabled}
                      onChange={() => toggleSeedDocument(document.id)}
                    />
                    <div>
                      <strong>{document.name}</strong>
                      <span>{document.enabled ? "現在は使用中" : "現在は未使用"}</span>
                    </div>
                  </label>
                  <div className="document-actions">
                    <span className="document-badge">初期資料</span>
                    <button
                      type="button"
                      className="toggle-use-button"
                      onClick={() => toggleSeedDocument(document.id)}
                    >
                      {document.enabled ? "使用しない" : "使用する"}
                    </button>
                  </div>
                </article>
              ))}

              {uploadedDocuments.map((document) => (
                <article
                  key={document.id}
                  className={document.enabled ? "document-chip" : "document-chip is-muted"}
                >
                  <label className="document-check">
                    <input
                      type="checkbox"
                      checked={document.enabled}
                      onChange={() => toggleUploadedDocument(document.id)}
                    />
                    <div>
                      <strong>{document.name}</strong>
                      <span>
                        {document.enabled ? "現在は使用中" : "現在は未使用"} /{" "}
                        {document.kind === "pdf" ? "PDF資料" : "テキスト資料"}
                      </span>
                    </div>
                  </label>
                  <div className="document-actions">
                    <button
                      type="button"
                      className="toggle-use-button"
                      onClick={() => toggleUploadedDocument(document.id)}
                    >
                      {document.enabled ? "使用しない" : "使用する"}
                    </button>
                    <button type="button" onClick={() => removeDocument(document.id)}>
                      削除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>

        <section className="chat-card" aria-label="チャット画面">
          <div className="chat-header">
            <div>
              <p className="section-label">Conversation</p>
              <h2>会話履歴</h2>
            </div>
            <span className="hint-text">Enterで送信 / Shift+Enterで改行</span>
          </div>

          <div className="messages-panel" aria-live="polite">
            {messages.map((message) => (
              <article
                key={message.id}
                className={message.role === "user" ? "message-row is-user" : "message-row"}
              >
                <div
                  className={
                    message.role === "user" ? "message-bubble is-user" : "message-bubble"
                  }
                >
                  <p>{message.content}</p>
                  {message.sources && message.sources.length > 0 ? (
                    <div className="sources-box">
                      <span className="sources-label">参照資料</span>
                      {message.sources.map((source) => (
                        <div key={`${message.id}-${source.title}-${source.excerpt.slice(0, 12)}`}>
                          <strong>{source.title}</strong>
                          <small>{source.excerpt}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}

            {isSending ? (
              <article className="message-row">
                <div className="message-bubble is-loading">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            ) : null}

            <div ref={scrollAnchorRef} />
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="chat-input">
              メッセージ入力
            </label>
            <textarea
              id="chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="資料に基づいて聞きたい内容を入力してください"
              rows={3}
              disabled={isSending}
            />
            <div className="composer-footer">
              <p className="composer-note">
                選択されている資料だけを使って回答します。根拠がない場合は回答を留保します。
              </p>
              <button type="submit" className="send-button" disabled={isSending || !input.trim()}>
                送信
              </button>
            </div>
          </form>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </section>
      </section>
    </main>
  );
}
