"use client";

import { FormEvent, useEffect, useState } from "react";

type Todo = {
  id: number;
  text: string;
  completed: boolean;
};

const STORAGE_KEY = "jp-simple-todos";

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    if (saved) {
      try {
        setTodos(JSON.parse(saved) as Todo[]);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [isLoaded, todos]);

  const remainingCount = todos.filter((todo) => !todo.completed).length;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = input.trim();

    if (!trimmed) {
      return;
    }

    setTodos((current) => [
      {
        id: Date.now(),
        text: trimmed,
        completed: false
      },
      ...current
    ]);
    setInput("");
  };

  const toggleTodo = (id: number) => {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  };

  const deleteTodo = (id: number) => {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  };

  return (
    <main className="page-shell">
      <section className="todo-card">
        <div className="hero">
          <p className="eyebrow">Simple Todo</p>
          <h1>やることリスト</h1>
          <p className="description">
            必要な機能だけに絞った、すっきり使えるToDoアプリです。
          </p>
        </div>

        <form className="todo-form" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="todo-input">
            タスクを入力
          </label>
          <input
            id="todo-input"
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="やることを入力してください"
            autoComplete="off"
          />
          <button type="submit">追加</button>
        </form>

        <div className="status-row">
          <span>未完了 {remainingCount} 件</span>
          <span>合計 {todos.length} 件</span>
        </div>

        <ul className="todo-list" aria-live="polite">
          {todos.length === 0 ? (
            <li className="empty-state">
              まだタスクはありません。最初の1件を追加してみましょう。
            </li>
          ) : (
            todos.map((todo) => (
              <li
                key={todo.id}
                className={todo.completed ? "todo-item is-completed" : "todo-item"}
              >
                <label className="check-area">
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={() => toggleTodo(todo.id)}
                  />
                  <span>{todo.text}</span>
                </label>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => deleteTodo(todo.id)}
                  aria-label={`${todo.text} を削除`}
                >
                  削除
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
