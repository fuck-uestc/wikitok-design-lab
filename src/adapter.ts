/**
 * 将官方 IsaacGemal/wikitok 的 WikiArticle 映射为视图模型。
 * 这不是新的请求客户端；继续复用 useWikiArticles。
 * 仅作接线参考，原型 app.js 尚未调用此函数。
 */
export interface WikiArticle {
  pageid: number;
  title: string;
  displaytitle?: string;
  extract?: string;
  url?: string;
  thumbnail?: { source: string; width?: number; height?: number };
}

export interface ArticleViewModel {
  id: string;
  pageid: number;
  language: string;
  title: string;
  extract: string;
  url: string;
  image?: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    // 不把 Wikipedia 当成图片作者；没有元数据时省略。
    credit?: string;
  };
  // 以下均为可选编辑增强；原版 API 不直接提供这些字段。
  headline?: string[];
  englishTitle?: string;
  topics?: string[];
  fact?: { value: string; label: string; sourceUrl: string };
}

function safeHttpsUrl(input: unknown): string | undefined {
  if (typeof input !== "string" || !input.trim()) return undefined;
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** 只返回文本。不要将 displaytitle 直接传给 dangerouslySetInnerHTML。 */
function plainText(input: unknown): string {
  if (typeof input !== "string") return "";
  if (typeof DOMParser === "undefined") {
    // SSR 回退：保留实体原文，不把其当作 HTML 输出。
    return input.replace(/<[^>]*>/g, "").trim();
  }
  return new DOMParser().parseFromString(input, "text/html")
    .body.textContent?.trim() ?? "";
}

export function normalizeWikiArticle(
  article: WikiArticle,
  language: string,
): ArticleViewModel | null {
  if (!Number.isSafeInteger(article.pageid) || article.pageid <= 0) return null;
  const title = plainText(article.displaytitle) || plainText(article.title);
  const url = safeHttpsUrl(article.url);
  if (!title || !url) return null;

  const src = safeHttpsUrl(article.thumbnail?.source);
  return {
    id: `${language}:${article.pageid}`, // pageid 只在对应 wiki 内唯一。
    pageid: article.pageid,
    language,
    title,
    extract: typeof article.extract === "string" ? article.extract.trim() : "",
    url,
    image: src ? {
      src,
      alt: title,
      width: article.thumbnail?.width,
      height: article.thumbnail?.height,
    } : undefined,
    // 不在这里假造“知识钩子”、英译、数字事实或主题分类。
  };
}

/*
React 接线示意（按目标仓库的实际组件名调整）：

const { articles, loading, fetchArticles } = useWikiArticles();
const cards = useMemo(
  () => articles
    .map(a => normalizeWikiArticle(a, currentLanguage.id))
    .filter((a): a is ArticleViewModel => a !== null),
  [articles, currentLanguage.id],
);

<KnowledgeFeed
  articles={cards}
  loading={loading}
  onNearEnd={fetchArticles}
  renderCard={article => <EditorialCard article={article} />}
/>

若启用无图卡片，需要放宽原 useWikiArticles 中
article.thumbnail && article.thumbnail.source 的过滤条件。
这属于前端数据处理，不要求新增服务端。

不要把有限 Demo 的“第 6 条后返回第 1 条”逻辑带进真实无限流。
*/
