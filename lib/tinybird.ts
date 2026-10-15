import { defineDatasource, defineEndpoint, node, t, p, engine, Tinybird, type InferRow } from "@tinybirdco/sdk";

// Append-only history: one row per item per fetch snapshot.
export const aiNews = defineDatasource("ai_news", {
  description: "AI dashboard news items, one row per item per fetch",
  schema: {
    id: t.string(), // sha1(url)
    module: t.string().lowCardinality(),
    title: t.string(),
    summary: t.string(),
    url: t.string(),
    source: t.string(),
    published_at: t.dateTime().nullable(),
    fetched_at: t.dateTime(),
    extra: t.string(), // JSON string: stars, likes, etc.
  },
  engine: engine.mergeTree({ sortingKey: ["module", "fetched_at"] }),
});
export type AiNewsRow = InferRow<typeof aiNews>;

export const newsHistory = defineEndpoint("news_history", {
  description: "Query news history by date range, module, keyword",
  params: {
    date_from: p.dateTime().optional("2000-01-01 00:00:00"),
    date_to: p.dateTime().optional("2100-01-01 00:00:00"),
    module: p.string().optional(""),
    keyword: p.string().optional(""),
    limit: p.int32().optional(100),
  },
  nodes: [node({ name: "history", sql: `
    SELECT id, module, title, summary, url, source, published_at, fetched_at, extra
    FROM ai_news
    WHERE fetched_at >= {{DateTime(date_from, '2000-01-01 00:00:00')}}
      AND fetched_at <= {{DateTime(date_to, '2100-01-01 00:00:00')}}
      {% if defined(module) and module != '' %} AND module = {{String(module)}} {% end %}
      {% if defined(keyword) and keyword != '' %}
        AND (positionCaseInsensitiveUTF8(title, {{String(keyword)}}) > 0
          OR positionCaseInsensitiveUTF8(summary, {{String(keyword)}}) > 0)
      {% end %}
    ORDER BY fetched_at DESC
    LIMIT {{Int32(limit, 100)}}` })],
  output: {
    id: t.string(), module: t.string().lowCardinality(), title: t.string(), summary: t.string(),
    url: t.string(), source: t.string(), published_at: t.dateTime().nullable(),
    fetched_at: t.dateTime(), extra: t.string(),
  },
});

export const newsDailyCounts = defineEndpoint("news_daily_counts", {
  description: "Item counts per fetch day (UTC+8) per module",
  params: {},
  nodes: [node({ name: "counts", sql: `
    SELECT toDate(fetched_at, 'Asia/Shanghai') AS day, module,
           count() AS items, uniqExact(id) AS unique_items
    FROM ai_news GROUP BY day, module ORDER BY day DESC, module` })],
  output: { day: t.date(), module: t.string().lowCardinality(), items: t.uint64(), unique_items: t.uint64() },
});

export const tinybird = new Tinybird({
  datasources: { aiNews },
  pipes: { newsHistory, newsDailyCounts },
  baseUrl: process.env.TINYBIRD_URL,
  token: process.env.TINYBIRD_TOKEN,
} as any);
