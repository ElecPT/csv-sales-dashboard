import { env } from "cloudflare:workers";

type RuntimeEnv = { DB: D1Database; MEDIA: R2Bucket };

const createTable = `CREATE TABLE IF NOT EXISTS classroom_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

async function database() {
  const runtime = env as unknown as RuntimeEnv;
  await runtime.DB.prepare(createTable).run();
  return runtime.DB;
}

export async function GET() {
  try {
    const db = await database();
    const result = await db.prepare(`SELECT id, client_id AS clientId, name, kind, content, created_at AS createdAt FROM classroom_posts ORDER BY id ASC LIMIT 120`).all();
    return Response.json({ posts: result.results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取课堂内容失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const clientId = String(form.get("clientId") || "").trim();
    const name = String(form.get("name") || "").trim().slice(0, 12);
    const kind = String(form.get("kind") || "");
    if (!clientId || !name || !["text", "image"].includes(kind)) return Response.json({ error: "提交信息不完整" }, { status: 400 });

    const db = await database();
    const existing = await db.prepare("SELECT 1 FROM classroom_posts WHERE client_id = ? LIMIT 1").bind(clientId).first();
    if (!existing) {
      const count = await db.prepare("SELECT COUNT(DISTINCT client_id) AS total FROM classroom_posts").first<{ total: number }>();
      if ((count?.total || 0) >= 6) return Response.json({ error: "本次课堂的 6 个席位已经满了" }, { status: 409 });
    }

    let content = String(form.get("content") || "").trim().slice(0, 180);
    if (kind === "image") {
      const image = form.get("image");
      if (!(image instanceof File) || !image.type.startsWith("image/") || image.size > 5 * 1024 * 1024) return Response.json({ error: "请选择 5MB 以内的 JPG、PNG 或 WEBP 图片" }, { status: 400 });
      const runtime = env as unknown as RuntimeEnv;
      const extension = image.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const key = `${crypto.randomUUID()}.${extension}`;
      await runtime.MEDIA.put(key, image.stream(), { httpMetadata: { contentType: image.type } });
      content = `/api/media/${key}`;
    }
    if (!content) return Response.json({ error: "内容不能为空" }, { status: 400 });

    await db.prepare("INSERT INTO classroom_posts (client_id, name, kind, content) VALUES (?, ?, ?, ?)").bind(clientId, name, kind, content).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "发送失败" }, { status: 500 });
  }
}
