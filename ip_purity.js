/*
 * Surge 面板：IP 纯净度
 * 数据来源：my.ippure.com
 * 参数：Proxy=策略组或节点（默认 DIRECT）；MarkIP=是否打码 true/false（默认 true）
 */

const parseArgs = (s) =>
  Object.fromEntries(
    String(s || "")
      .split("&")
      .filter(Boolean)
      .map((kv) => {
        const i = kv.indexOf("=");
        return i < 0
          ? [kv, ""]
          : [kv.slice(0, i), decodeURIComponent(kv.slice(i + 1))];
      })
  );

const args = typeof $argument !== "undefined" ? parseArgs($argument) : {};
const proxy = (args.Proxy || "").trim() || "DIRECT";
const markIP = String(args.MarkIP ?? "true").toLowerCase() !== "false";

const flag = (cc) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : "🏳️";

const get = (url) =>
  new Promise((resolve, reject) =>
    $httpClient.get(
      { url, timeout: 8, policy: proxy, headers: { "User-Agent": "Mozilla/5.0" } },
      (err, resp, data) => (err ? reject(err) : resolve(data))
    )
  );

// 58.246.12.121 -> 58.246.•••.121
const mask = (ip) => {
  if (ip.includes(".")) {
    const p = ip.split(".");
    return p.length === 4 ? `${p[0]}.${p[1]}.•••.${p[3]}` : ip;
  }
  const p = ip.split(":");
  return p.length > 4 ? `${p[0]}:${p[1]}:•••:${p[p.length - 1]}` : ip;
};

// 风险分档：天气 emoji + SF Symbols 图标 + 颜色
const risk = (s) => {
  if (s < 20) return { dot: "☀️", color: "#34C759", icon: "checkmark.seal" };
  if (s < 40) return { dot: "🌤️", color: "#34C759", icon: "checkmark.shield" };
  if (s < 70) return { dot: "⛅", color: "#FFCC00", icon: "exclamationmark.triangle" };
  if (s < 85) return { dot: "🌦️", color: "#FF9500", icon: "exclamationmark.triangle" };
  return { dot: "⛈️", color: "#FF3B30", icon: "xmark.shield" };
};

(async () => {
  try {
    const d = JSON.parse(await get("https://my.ippure.com/v1/info"));
    const score = Number(d.fraudScore ?? 0);
    const r = risk(score);

    const type = d.isBroadcast
      ? "📡 广播 IP"
      : d.isResidential
      ? "🏠 住宅 / 家宽"
      : "🏢 机房 / 商业";

    const ver = d.ip.includes(":") ? "IPv6" : "IPv4";
    const ip = markIP ? mask(d.ip) : d.ip;
    const place = [d.city || d.region, d.country].filter(Boolean).join(" · ");

    const content = [
      `${ver}  ${ip}`,
      `位置  ${flag(d.countryCode)} · ${place}`,
      `ASN  AS${String(d.asn).replace(/^AS/i, "")}`,
      `类型  ${type}`,
      `风险等级  ${r.dot} ${score}`,
    ].join("\n");

    $done({ title: "IP 纯净度", content, icon: r.icon, "icon-color": r.color });
  } catch (e) {
    $done({
      title: "IP 纯净度",
      content: "🌫️ 检测失败：" + (e.message || e),
      icon: "xmark.circle",
      "icon-color": "#FF3B30",
    });
  }
})();
