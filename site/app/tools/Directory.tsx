"use client";
import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import entries from "@/data/registry.json";
export default function Directory() {
  const [query, setQuery] = useState("");
  const items = entries.filter((item) =>
    `${item.name} ${item.id} ${item.purpose} ${item.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="tools-toolbar">
        <Input
          type="search"
          aria-label="Search CLI tools"
          placeholder="Search tools, capabilities, or categories…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="count" aria-live="polite">
          {items.length} {items.length === 1 ? "tool" : "tools"}
        </span>
      </div>
      <div className="tool-list">
        {items.length ? (
          items.map((item) => (
            <Link className="tool-row" href={`/tools/${item.id}`} key={item.id}>
              <span className="tool-icon" aria-hidden="true">
                {item.id === "git" ? "±" : item.id === "gh" ? "gh" : "{}"}
              </span>
              <div>
                <h2>{item.name}</h2>
                <p>{item.purpose}</p>
              </div>
              <div className="tool-meta">
                {item.category}
                <br />
                Schema v{item.version}
              </div>
              <span aria-hidden="true">↗</span>
            </Link>
          ))
        ) : (
          <p className="empty">
            No tools match “{query}”. Try another name or contribute a schema.
          </p>
        )}
      </div>
    </>
  );
}
