"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Post = {
  id: number;
  clientId: string;
  name: string;
  kind: "text" | "image";
  content: string;
  createdAt: string;
};

const STORAGE_KEY = "classroom-screen-client-id";

function getClientId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export default function Classroom() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [joinUrl, setJoinUrl] = useState("");
  const [isJoin, setIsJoin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"text" | "image">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");

  const loadPosts = useCallback(async () => {
    try {
      const response = await fetch("/api/posts", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "同步失败");
      setPosts(data.posts || []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    setIsJoin(url.searchParams.get("join") === "1");
    url.search = "?join=1";
    url.hash = "";
    setJoinUrl(url.toString());
    void loadPosts();
    const timer = window.setInterval(loadPosts, 2000);
    return () => window.clearInterval(timer);
  }, [loadPosts]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const seats = useMemo(() => {
    const seen = new Set<string>();
    return [...posts].reverse().filter((post) => {
      if (seen.has(post.clientId)) return false;
      seen.add(post.clientId);
      return true;
    }).reverse().slice(0, 6);
  }, [posts]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!name.trim()) return setError("请先填写你的名字");
    if (mode === "text" && !text.trim()) return setError("请输入要投屏的文字");
    if (mode === "image" && !file) return setError("请选择一张图片");

    const form = new FormData();
    form.set("clientId", getClientId());
    form.set("name", name.trim());
    form.set("kind", mode);
    if (mode === "text") form.set("content", text.trim());
    if (file) form.set("image", file);
    setSending(true);
    try {
      const response = await fetch("/api/posts", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "发送失败");
      setText("");
      setFile(null);
      setPreview("");
      setSuccess("发送成功，内容已经出现在大屏上");
      await loadPosts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  if (isJoin) {
    return (
      <main className="joinPage">
        <section className="joinCard">
          <div className="joinBrand"><span>投</span><div><strong>课堂投屏</strong><small>CLASSROOM SCREEN</small></div></div>
          <div className="joinIntro"><span className="liveDot" /> 已连接到课堂大屏</div>
          <h1>把想法投到大屏上</h1>
          <p className="joinLead">填写名字，选择文字或图片，点击发送即可。</p>
          <form onSubmit={submit}>
            <label className="fieldLabel" htmlFor="student-name">你的名字</label>
            <input id="student-name" className="textInput" value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="例如：林小满" />
            <div className="modeTabs" role="tablist" aria-label="投稿类型">
              <button type="button" className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><span>Aa</span> 文字</button>
              <button type="button" className={mode === "image" ? "active" : ""} onClick={() => setMode("image")}><span>▧</span> 图片</button>
            </div>
            {mode === "text" ? (
              <div className="composeWrap">
                <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={180} placeholder="写下你想分享的内容…" />
                <span>{text.length} / 180</span>
              </div>
            ) : (
              <label className={`uploadBox ${preview ? "hasPreview" : ""}`}>
                {preview ? <img src={preview} alt="待上传图片预览" /> : <><b>＋</b><strong>选择一张图片</strong><small>支持 JPG、PNG、WEBP，最大 5MB</small></>}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
                  const next = e.target.files?.[0] || null;
                  if (preview) URL.revokeObjectURL(preview);
                  setFile(next);
                  setPreview(next ? URL.createObjectURL(next) : "");
                }} />
              </label>
            )}
            {error && <p className="formMessage error">{error}</p>}
            {success && <p className="formMessage success">{success}</p>}
            <button className="sendButton" disabled={sending}>{sending ? "正在发送…" : "发送到大屏"}<span>→</span></button>
          </form>
          <p className="privacyNote">你的内容仅在本次课堂中展示</p>
        </section>
      </main>
    );
  }

  return (
    <main className="screenPage">
      <header className="screenHeader">
        <div className="screenBrand"><span>投</span><div><strong>课堂投屏</strong><small>CLASSROOM SCREEN</small></div></div>
        <div className="classStatus"><span className="liveDot" /> 课堂进行中 <b>{seats.length} / 6 在线</b></div>
      </header>
      <section className="screenGrid">
        <div className="stage">
          <div className="stageTitle"><div><span>实时互动</span><h1>扫码参与课堂</h1><p>用微信扫描二维码，发送文字或图片到大屏</p></div><b>最多 6 人同时在线</b></div>
          <div className="qrPanel">
            <div className="qrCode">{joinUrl && <QRCodeSVG value={joinUrl} size={210} level="M" bgColor="#ffffff" fgColor="#10261f" />}</div>
            <div className="qrCopy"><span>STEP 01</span><h2>微信扫码</h2><p>无需下载，无需登录<br />打开后即可发送内容</p><div className="scanLine"><i /> 安全连接已开启</div></div>
          </div>
          <div className="flowSteps"><span><b>1</b>微信扫码</span><i>→</i><span><b>2</b>选择文字或图片</span><i>→</i><span><b>3</b>发送到大屏</span></div>
          <div className="latestStrip">
            <span>最新动态</span>
            <p>{loading ? "正在连接课堂…" : posts.length ? `${posts[posts.length - 1].name} 刚刚发送了${posts[posts.length - 1].kind === "text" ? "一段文字" : "一张图片"}` : "等待第一位同学加入课堂"}</p>
          </div>
          {error && <div className="screenError">{error}</div>}
        </div>
        <aside className="seatRail">
          <div className="seatHeader"><div><span>参与席位</span><strong>{seats.length}<small> / 6</small></strong></div><p>内容会显示在对应席位下方</p></div>
          <div className="seatList">
            {Array.from({ length: 6 }, (_, index) => {
              const post = seats[index];
              return post ? (
                <article className="seat occupied" key={post.clientId}>
                  <div className="avatar">{post.name.slice(0, 1)}</div>
                  <div className="seatContent"><div><strong>{post.name}</strong><span><i /> 在线</span></div>{post.kind === "text" ? <p>{post.content}</p> : <img src={post.content} alt={`${post.name} 分享的图片`} />}</div>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                </article>
              ) : (
                <article className="seat empty" key={index}><div className="avatar">＋</div><div className="seatContent"><strong>等待加入</strong><p>扫描左侧二维码参与</p></div><b>{String(index + 1).padStart(2, "0")}</b></article>
              );
            })}
          </div>
          <div className="railFoot"><span className="liveDot" /> 每 2 秒自动同步</div>
        </aside>
      </section>
    </main>
  );
}
