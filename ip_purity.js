/*
 * Surge 面板：IP 纯净度（直连 + 节点，一个面板同时显示）
 * 数据来源：my.ippure.com
 * 参数：Proxy=策略组或节点（默认 Proxy，填 DIRECT 则只显示直连）
 *       MarkIP=是否打码 true/false（默认 true）
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
const proxy = (args.Proxy || "").trim() || "Proxy";
const markIP = String(args.MarkIP ?? "true").toLowerCase() !== "false";

const flag = (cc) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : "🏳️";

const get = (url, policy) =>
  new Promise((resolve, reject) =>
    $httpClient.get(
      { url, timeout: 8, policy, headers: { "User-Agent": "Mozilla/5.0" } },
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

const query = async (policy) => {
  const d = JSON.parse(await get("https://my.ippure.com/v1/info", policy));
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
  return {
    score,
    r,
    lines: [
      `${ver}  ${ip}`,
      `位置  ${flag(d.countryCode)} · ${place}`,
      `ASN  AS${String(d.asn).replace(/^AS/i, "")}`,
      `类型  ${type}`,
      `风险等级  ${r.dot} ${score}`,
    ],
  };
};

(async () => {
  const targets =
    proxy.toUpperCase() === "DIRECT"
      ? [{ label: "直连", policy: "DIRECT" }]
      : [
          { label: "直连", policy: "DIRECT" },
          { label: `节点 · ${proxy}`, policy: proxy },
        ];

  const results = await Promise.allSettled(targets.map((t) => query(t.policy)));

  const blocks = [];
  let worst = null;
  results.forEach((res, i) => {
    const head = `【${targets[i].label}】`;
    if (res.status === "fulfilled") {
      blocks.push([head, ...res.value.lines].join("\n"));
      if (!worst || res.value.score > worst.score) worst = res.value;
    } else {
      const msg = (res.reason && res.reason.message) || res.reason;
      blocks.push(`${head}\n🌫️ 检测失败：${msg}`);
    }
  });

  if (!worst) {
    $done({
      title: "IP 纯净度",
      content: blocks.join("\n\n"),
      icon: "xmark.circle",
      "icon-color": "#FF3B30",
    });
    return;
  }

  // 图标和颜色跟随风险更高的那一个
  $done({
    title: "IP 纯净度",
    content: blocks.join("\n\n"),
    icon: worst.r.icon,
    "icon-color": worst.r.color,
  });
})();
