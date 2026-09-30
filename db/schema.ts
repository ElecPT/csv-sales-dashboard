import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const classroomPosts = sqliteTable("classroom_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["text", "image"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
