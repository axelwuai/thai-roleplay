import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "泰语开口练习",
    short_name: "泰语开口练习",
    description:
      "面向中文用户的 AI 泰语口语练习应用，支持场景角色扮演、练习记录保存与账号同步。",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f0e8",
    theme_color: "#f5f0e8",
    lang: "zh-CN",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
