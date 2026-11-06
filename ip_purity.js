/*
 * Surge 面板：IP 纯净度
 * 数据来源：my.ippure.com
 */

const flag = (cc) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : "🏳️";

const get = (url) =>
  new Promise((resolve, reject) =>
    $httpClient.get(
      { url, timeout: 8, headers: { "User-Agent": "Mozilla/5.0" } },
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

const risk = (s) => {
  if (s < 20) return { dot: "🟢", color: "#34C759", icon: "checkmark.seal.fill" };
  if (s < 40) return { dot: "🟢", color: "#34C759", icon: "checkmark.shield.fill" };
  if (s < 70) return { dot: "🟡", color: "#FFCC00", icon: "exclamationmark.triangle.fill" };
  if (s < 85) return { dot: "🟠", color: "#FF9500", icon: "exclamationmark.shield.fill" };
  return { dot: "🔴", color: "#FF3B30", icon: "xmark.shield.fill" };
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
    const place = [d.city || d.region, d.country].filter(Boolean).join(" · ");

    const content = [
      `${ver}  ${d.ip}`,
      `位置  ${flag(d.countryCode)} · ${place}`,
      `ASN  AS${String(d.asn).replace(/^AS/i, "")}`,
      `类型  ${type}`,
      `风险等级  ${r.dot} ${score}`,
    ].join("\n");

    $done({ title: "IP 纯净度", content, icon: r.icon, "icon-color": r.color });
  } catch (e) {
    $done({
      title: "IP 纯净度",
      content: "检测失败：" + (e.message || e),
      icon: "xmark.circle.fill",
      "icon-color": "#FF3B30",
    });
  }
})();
