import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og-bi.png`;
  const title = "数览 BI｜电商销售经营看板";
  const description = "上传 CSV 即可自动生成销售、订单、渠道与商品经营分析看板。";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: imageUrl, width: 1744, height: 913, alt: "数览 BI 电商销售经营看板" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
