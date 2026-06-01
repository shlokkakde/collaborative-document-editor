import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  ChevronDown,
  Cloud,
  FilePlus2,
  FileText,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Menu,
  MessageSquarePlus,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Search,
  Share2,
  Trash2,
  Underline,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  updateDocument,
  websocketUrl,
} from "./api";

const CLIENT_ID_KEY = "collab-editor-client-id";
const CLIENT_NAME_KEY = "collab-editor-client-name";

function getClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(CLIENT_ID_KEY, next);
  return next;
}

function getClientName() {
  const existing = window.localStorage.getItem(CLIENT_NAME_KEY);
  if (existing) return existing;
  const suffix = Math.floor(100 + Math.random() * 900);
  const next = `Editor ${suffix}`;
  window.localStorage.setItem(CLIENT_NAME_KEY, next);
  return next;
}

function formatUpdatedAt(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function documentIdFromPath() {
  const match = window.location.pathname.match(/^\/documents\/([^/]+)/);
  return match?.[1] || null;
}

function setDocumentPath(documentId) {
  const path = documentId ? `/documents/${documentId}` : "/";
  window.history.pushState({}, "", path);
}

export default function App() {
  const clientId = useMemo(getClientId, []);
  const initialClientName = useMemo(getClientName, []);
  const editorRef = useRef(null);
  const [clientName, setClientName] = useState(initialClientName);
  const [documents, setDocuments] = useState([]);
  const [activeId, setActiveId] = useState(documentIdFromPath);
  const [activeDocument, setActiveDocument] = useState(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connection, setConnection] = useState("idle");
  const [saveState, setSaveState] = useState("saved");
  const [reconnectTick, setReconnectTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [presence, setPresence] = useState({});
  const [remoteCursor, setRemoteCursor] = useState(null);
  const [fontSize, setFontSize] = useState(16);
  const [fontFamily, setFontFamily] = useState("Georgia");
  const [paragraphStyle, setParagraphStyle] = useState("normal");
  const [pageZoom, setPageZoom] = useState(100);
  const [textAlign, setTextAlign] = useState("left");
  const [shareState, setShareState] = useState("idle");
  const socketRef = useRef(null);
  const sendTimerRef = useRef(null);
  const titleTimerRef = useRef(null);
  const shareTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const httpSaveInFlightRef = useRef(false);
  const httpSavePendingRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const latestDraftRef = useRef({ title: "", content: "" });

  const refreshDocuments = useCallback(async () => {
    const response = await listDocuments();
    setDocuments(response.documents);
    return response.documents;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialState() {
      try {
        setLoading(true);
        const loaded = await refreshDocuments();
        if (!cancelled && !activeId && loaded.length > 0) {
          setActiveId(loaded[0].id);
          setDocumentPath(loaded[0].id);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadInitialState();
    return () => {
      cancelled = true;
    };
  }, [activeId, refreshDocuments]);

  useEffect(() => {
    function onPopState() {
      setActiveId(documentIdFromPath());
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setActiveDocument(null);
      setTitle("");
      setContent("");
      setConnection("idle");
      return undefined;
    }

    let cancelled = false;
    setError("");
    setConnection("connecting");
    setPresence({});
    setRemoteCursor(null);

    async function loadDocument() {
      try {
        const response = await getDocument(activeId);
        if (cancelled) return;
        setActiveDocument(response.document);
        setTitle(response.document.title);
        setContent(response.document.content);
        latestDraftRef.current = {
          title: response.document.title,
          content: response.document.content,
        };
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setConnection("error");
        }
      }
    }

    loadDocument();

    const socket = new WebSocket(websocketUrl(activeId, clientId, clientName));
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      reconnectAttemptRef.current = 0;
      setConnection("live");
    });
    socket.addEventListener("close", () => {
      if (socketRef.current !== socket || cancelled) return;
      setConnection("offline");
      const delay = Math.min(10000, 1000 * 2 ** reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        if (!cancelled) setReconnectTick((value) => value + 1);
      }, delay);
    });
    socket.addEventListener("error", () => setConnection("error"));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "document.snapshot") {
        applyingRemoteRef.current = true;
        setActiveDocument(message.document);
        setSaveState("saved");
        setTitle(message.document.title);
        setContent(message.document.content);
        latestDraftRef.current = {
          title: message.document.title,
          content: message.document.content,
        };
        applyingRemoteRef.current = false;
      }

      if (message.type === "document.update") {
        setActiveDocument(message.document);
        setSaveState("saved");
        setDocuments((current) =>
          current.map((doc) =>
            doc.id === message.document.id
              ? { ...doc, ...message.document }
              : doc,
          ),
        );
        if (message.clientId !== clientId) {
          applyingRemoteRef.current = true;
          setTitle(message.document.title);
          setContent(message.document.content);
          latestDraftRef.current = {
            title: message.document.title,
            content: message.document.content,
          };
          applyingRemoteRef.current = false;
        }
      }

      if (message.type === "presence.join") {
        setPresence((current) => ({
          ...current,
          [message.clientId]: {
            id: message.clientId,
            name: message.name,
          },
        }));
      }

      if (message.type === "presence.leave") {
        setPresence((current) => {
          const next = { ...current };
          delete next[message.clientId];
          return next;
        });
      }

      if (message.type === "cursor.move") {
        setRemoteCursor({
          name: message.name,
          selectionStart: message.selectionStart,
          selectionEnd: message.selectionEnd,
        });
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimerRef.current);
      if (socketRef.current === socket) socketRef.current = null;
      socket.close();
    };
  }, [activeId, clientId, clientName, reconnectTick]);

  useEffect(() => {
    latestDraftRef.current = { title, content };
  }, [title, content]);

  const persistDraftOverHttp = useCallback(async () => {
    if (!activeId) return;
    if (httpSaveInFlightRef.current) {
      httpSavePendingRef.current = true;
      return;
    }

    httpSaveInFlightRef.current = true;
    setSaveState("saving");
    try {
      let response;
      do {
        httpSavePendingRef.current = false;
        response = await updateDocument(activeId, { ...latestDraftRef.current });
      } while (httpSavePendingRef.current);

      if (response) {
        setActiveDocument(response.document);
        setDocuments((current) =>
          current.map((doc) =>
            doc.id === response.document.id
              ? { ...doc, ...response.document }
              : doc,
          ),
        );
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      httpSaveInFlightRef.current = false;
    }
  }, [activeId]);

  const sendDraft = useCallback(() => {
    if (!activeId) return;
    setSaveState("saving");
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      persistDraftOverHttp();
      return;
    }
    socket.send(
      JSON.stringify({
        type: "document.update",
        title: latestDraftRef.current.title,
        content: latestDraftRef.current.content,
      }),
    );
  }, [activeId, persistDraftOverHttp]);

  const scheduleDraftSend = useCallback(() => {
    if (applyingRemoteRef.current) return;
    window.clearTimeout(sendTimerRef.current);
    sendTimerRef.current = window.setTimeout(sendDraft, 220);
  }, [sendDraft]);

  const setDraftContent = useCallback(
    (nextContent) => {
      setContent(nextContent);
      latestDraftRef.current = {
        ...latestDraftRef.current,
        content: nextContent,
      };
      scheduleDraftSend();
    },
    [scheduleDraftSend],
  );

  const selectDocument = useCallback((documentId) => {
    setActiveId(documentId);
    setDocumentPath(documentId);
  }, []);

  const handleCreateDocument = useCallback(async () => {
    setError("");
    const response = await createDocument({
      title: "Untitled document",
      content: "",
    });
    setDocuments((current) => [response.document, ...current]);
    selectDocument(response.document.id);
  }, [selectDocument]);

  const handleDeleteDocument = useCallback(async () => {
    if (!activeId) return;
    await deleteDocument(activeId);
    const nextDocuments = documents.filter((doc) => doc.id !== activeId);
    setDocuments(nextDocuments);
    const nextActiveId = nextDocuments[0]?.id || null;
    setActiveId(nextActiveId);
    setDocumentPath(nextActiveId);
  }, [activeId, documents]);

  const handleContentChange = (event) => {
    setDraftContent(event.target.value);
  };

  const handleTitleChange = (event) => {
    const nextTitle = event.target.value;
    setTitle(nextTitle);
    latestDraftRef.current = {
      ...latestDraftRef.current,
      title: nextTitle,
    };
    window.clearTimeout(titleTimerRef.current);
    titleTimerRef.current = window.setTimeout(() => {
      setDocuments((current) =>
        current.map((doc) =>
          doc.id === activeId ? { ...doc, title: nextTitle } : doc,
        ),
      );
      scheduleDraftSend();
    }, 160);
  };

  const handleCursorChange = (event) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(
      JSON.stringify({
        type: "cursor.move",
        selectionStart: event.target.selectionStart,
        selectionEnd: event.target.selectionEnd,
      }),
    );
  };

  const handleNameChange = (event) => {
    const nextName = event.target.value.slice(0, 40);
    setClientName(nextName);
    window.localStorage.setItem(CLIENT_NAME_KEY, nextName);
  };

  const handleManualSave = async () => {
    if (!activeId) return;
    setSaveState("saving");
    const response = await updateDocument(activeId, { title, content });
    setActiveDocument(response.document);
    await refreshDocuments();
    setSaveState("saved");
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      window.prompt("Copy link", window.location.href);
    }
    setShareState("copied");
    window.clearTimeout(shareTimerRef.current);
    shareTimerRef.current = window.setTimeout(() => setShareState("idle"), 1600);
  };

  const applySelectionTransform = useCallback(
    (transform) => {
      const editor = editorRef.current;
      if (!editor) return;

      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const selection = content.slice(start, end) || "text";
      const result = transform(content, start, end, selection);
      setDraftContent(result.next);

      requestAnimationFrame(() => {
        editor.focus();
        editor.setSelectionRange(result.cursorStart, result.cursorEnd);
      });
    },
    [content, setDraftContent],
  );

  const wrapSelection = useCallback(
    (before, after = before) => {
      applySelectionTransform((value, start, end, selection) => {
        const next =
          value.slice(0, start) + before + selection + after + value.slice(end);
        return {
          next,
          cursorStart: start + before.length,
          cursorEnd: start + before.length + selection.length,
        };
      });
    },
    [applySelectionTransform],
  );

  const prefixSelectedLines = useCallback(
    (prefix) => {
      applySelectionTransform((value, start, end) => {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const lineEndIndex = value.indexOf("\n", end);
        const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
        const selectedBlock = value.slice(lineStart, lineEnd);
        const nextBlock = selectedBlock
          .split("\n")
          .map((line, index) => {
            if (prefix === "ordered") return `${index + 1}. ${line}`;
            if (prefix === "title") return `# ${line}`;
            if (prefix === "heading") return `## ${line}`;
            return `- ${line}`;
          })
          .join("\n");
        const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
        return {
          next,
          cursorStart: lineStart,
          cursorEnd: lineStart + nextBlock.length,
        };
      });
    },
    [applySelectionTransform],
  );

  const handleParagraphStyleChange = (event) => {
    const nextStyle = event.target.value;
    setParagraphStyle(nextStyle);
    if (nextStyle === "title") {
      prefixSelectedLines("title");
    }
    if (nextStyle === "heading") {
      prefixSelectedLines("heading");
    }
  };

  const filteredDocuments = documents.filter((document) =>
    document.title.toLowerCase().includes(query.toLowerCase()),
  );
  const collaborators = Object.values(presence);
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const characters = content.length;
  const connectionLabel = {
    idle: "No document",
    connecting: "Connecting",
    live: "Live",
    offline: "Offline",
    error: "Connection issue",
  }[connection];
  const connectionIcon = connection === "live" ? <Wifi /> : <WifiOff />;
  const savedLabel = {
    saving: "Saving...",
    saved: connection === "live" ? "Synced" : "Saved",
    error: "Save failed",
  }[saveState];

  return (
    <main className="app-shell">
      <aside className={`doc-rail ${sidebarOpen ? "open" : "closed"}`}>
        <div className="rail-header">
          <button
            className="icon-button"
            type="button"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            onClick={() => setSidebarOpen((current) => !current)}
          >
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
          {sidebarOpen ? (
            <div className="rail-title">
              <strong>Documents</strong>
              <span>{documents.length} files</span>
            </div>
          ) : null}
        </div>

        {sidebarOpen ? (
          <>
            <button
              className="primary-action"
              type="button"
              data-testid="new-document"
              onClick={handleCreateDocument}
            >
              <FilePlus2 />
              <span>New</span>
            </button>

            <label className="search-box">
              <Search />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
              />
            </label>

            <div className="document-list">
              {filteredDocuments.map((document) => (
                <button
                  type="button"
                  className={`document-row ${
                    document.id === activeId ? "active" : ""
                  }`}
                  key={document.id}
                  onClick={() => selectDocument(document.id)}
                >
                  <FileText />
                  <span>
                    <strong>{document.title}</strong>
                    <small>{formatUpdatedAt(document.updatedAt)}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </aside>

      <section className="workspace">
        <header className="document-header">
          <div className="header-main">
            <div className="app-mark">
              <FileText />
            </div>
            <div className="title-stack">
              <input
                className="document-title-input"
                value={title || "Untitled document"}
                onChange={handleTitleChange}
                aria-label="Document title"
                disabled={!activeId}
              />
              <div className="header-meta">
                <span className={`sync-pill sync-${connection}`}>
                  {connectionIcon}
                  {connectionLabel}
                </span>
                <span className="cloud-state">
                  <Cloud />
                  {savedLabel}
                </span>
                <span>{words} words</span>
                <span>Revision {activeDocument?.revision ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="header-actions">
            <div className="collaborators" aria-label="Active collaborators">
              <span>{clientName.slice(0, 1).toUpperCase()}</span>
              {collaborators.slice(0, 3).map((collaborator) => (
                <span key={collaborator.id}>
                  {collaborator.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
            <label className="name-field">
              <Users />
              <input
                value={clientName}
                onChange={handleNameChange}
                aria-label="Display name"
              />
            </label>
            <button
              className="toolbar-button"
              type="button"
              title="Refresh"
              onClick={refreshDocuments}
            >
              <RefreshCcw />
            </button>
            <button
              className="toolbar-button"
              type="button"
              title="Save"
              disabled={!activeId}
              onClick={handleManualSave}
            >
              <Save />
            </button>
            <button
              className="share-button"
              type="button"
              disabled={!activeId}
              onClick={handleShare}
            >
              {shareState === "copied" ? <Check /> : <Share2 />}
              <span>{shareState === "copied" ? "Copied" : "Share"}</span>
            </button>
          </div>
        </header>

        <div className="editor-toolbar" aria-label="Editor toolbar">
          <div className="toolbar-group">
            <button
              className="toolbar-button"
              type="button"
              title={sidebarOpen ? "Hide documents" : "Show documents"}
              onClick={() => setSidebarOpen((current) => !current)}
            >
              <Menu />
            </button>
            <button
              className="toolbar-button"
              type="button"
              title="Print"
              onClick={() => window.print()}
            >
              <Printer />
            </button>
          </div>

          <div className="toolbar-group">
            <select
              aria-label="Paragraph style"
              value={paragraphStyle}
              onChange={handleParagraphStyleChange}
            >
              <option value="normal">Normal text</option>
              <option value="title">Title</option>
              <option value="heading">Heading</option>
            </select>
            <select
              aria-label="Font family"
              value={fontFamily}
              onChange={(event) => setFontFamily(event.target.value)}
            >
              <option>Georgia</option>
              <option>Arial</option>
              <option>Inter</option>
              <option>Times New Roman</option>
            </select>
          </div>

          <div className="toolbar-group compact">
            <button
              className="toolbar-button"
              type="button"
              title="Decrease font size"
              onClick={() => setFontSize((value) => Math.max(12, value - 1))}
            >
              <Minus />
            </button>
            <span className="number-readout">{fontSize}</span>
            <button
              className="toolbar-button"
              type="button"
              title="Increase font size"
              onClick={() => setFontSize((value) => Math.min(28, value + 1))}
            >
              <Plus />
            </button>
          </div>

          <div className="toolbar-group">
            <button
              className="toolbar-button"
              type="button"
              title="Bold"
              onClick={() => wrapSelection("**")}
            >
              <Bold />
            </button>
            <button
              className="toolbar-button"
              type="button"
              title="Italic"
              onClick={() => wrapSelection("_")}
            >
              <Italic />
            </button>
            <button
              className="toolbar-button"
              type="button"
              title="Underline"
              onClick={() => wrapSelection("<u>", "</u>")}
            >
              <Underline />
            </button>
            <button
              className="toolbar-button"
              type="button"
              title="Highlight"
              onClick={() => wrapSelection("==")}
            >
              <Highlighter />
            </button>
          </div>

          <div className="toolbar-group">
            <button
              className="toolbar-button"
              type="button"
              title="Bulleted list"
              onClick={() => prefixSelectedLines("bulleted")}
            >
              <List />
            </button>
            <button
              className="toolbar-button"
              type="button"
              title="Numbered list"
              onClick={() => prefixSelectedLines("ordered")}
            >
              <ListOrdered />
            </button>
            <button
              className={`toolbar-button ${textAlign === "left" ? "active" : ""}`}
              type="button"
              title="Align left"
              onClick={() => setTextAlign("left")}
            >
              <AlignLeft />
            </button>
            <button
              className={`toolbar-button ${
                textAlign === "center" ? "active" : ""
              }`}
              type="button"
              title="Align center"
              onClick={() => setTextAlign("center")}
            >
              <AlignCenter />
            </button>
            <button
              className={`toolbar-button ${textAlign === "right" ? "active" : ""}`}
              type="button"
              title="Align right"
              onClick={() => setTextAlign("right")}
            >
              <AlignRight />
            </button>
          </div>

          <div className="toolbar-group compact">
            <button
              className="toolbar-button"
              type="button"
              title="Zoom out"
              onClick={() => setPageZoom((value) => Math.max(80, value - 10))}
            >
              <Minus />
            </button>
            <span className="zoom-readout">{pageZoom}%</span>
            <button
              className="toolbar-button"
              type="button"
              title="Zoom in"
              onClick={() => setPageZoom((value) => Math.min(130, value + 10))}
            >
              <Plus />
            </button>
          </div>

          <button
            className="toolbar-button danger"
            type="button"
            title="Delete document"
            disabled={!activeId}
            onClick={handleDeleteDocument}
          >
            <Trash2 />
          </button>
        </div>

        {loading ? (
          <div className="empty-state">
            <Loader2 className="spin" />
          </div>
        ) : error ? (
          <div className="empty-state">
            <strong>Something needs attention</strong>
            <p>{error}</p>
          </div>
        ) : !activeId ? (
          <div className="empty-state">
            <FilePlus2 />
            <strong>Create a document to start collaborating</strong>
            <button type="button" onClick={handleCreateDocument}>
              New document
            </button>
          </div>
        ) : (
          <section className="canvas">
            <div className="ruler horizontal-ruler">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <article
              className="document-page"
              style={{
                width: `${8.5 * pageZoom}px`,
              }}
            >
              <textarea
                ref={editorRef}
                className="editor"
                data-testid="editor"
                value={content}
                onChange={handleContentChange}
                onSelect={handleCursorChange}
                onKeyUp={handleCursorChange}
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  textAlign,
                }}
                spellCheck="true"
                placeholder="Start typing..."
              />
            </article>
            <footer className="status-bar">
              <span>{characters} characters</span>
              <span>
                {formatUpdatedAt(activeDocument?.updatedAt)
                  ? `Updated ${formatUpdatedAt(activeDocument?.updatedAt)}`
                  : "Updated now"}
              </span>
              {remoteCursor ? <span>{remoteCursor.name} is editing</span> : null}
              <button
                type="button"
                title="Add comment"
                onClick={() => wrapSelection("[comment: ", "]")}
              >
                <MessageSquarePlus />
                <span>Comment</span>
              </button>
              <button type="button">
                <ChevronDown />
              </button>
            </footer>
          </section>
        )}
      </section>
    </main>
  );
}
