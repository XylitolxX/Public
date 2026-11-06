/*
 * Surge 面板：IP 纯净度（直连 / 节点）
 * 数据来源：my.ippure.com
 * 参数：Proxy=策略组或节点（默认 Proxy，留空则按分流规则）
 *       MarkIP=是否打码 true/false（默认 true）
 *       Mode=direct 只测直连 | proxy 只测节点 | both 两个都显示在同一面板（默认 both）
 * 兼容花体字策略组名：会自动匹配 Surge 里看起来相同的策略组
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
const proxyArg = (args.Proxy ?? "Proxy").trim();
const markIP = String(args.MarkIP ?? "true").toLowerCase() !== "false";
const mode = String(args.Mode ?? "both").toLowerCase();

// 花体字（数学字母等）转成普通字母后再比较
const norm = (s) => String(s).normalize("NFKC").trim().toLowerCase();

// 在 Surge 的策略组里找到和输入"看起来一样"的真实名字
const resolvePolicy = (name) => {
  if (!name) return undefined;
  if (name.toUpperCase() === "DIRECT") return "DIRECT";
  try {
    const info = $surge.selectGroupDetails();
    const pool = new Set();
    const add = (o) => o && typeof o === "object" && Object.keys(o).forEach((k) => pool.add(k));
    add(info && info.decisions);
    add(info && info.groups);
    add(info);
    for (const k of pool) if (k === name) return k;
    for (const k of pool) if (norm(k) === norm(name)) return k;
  } catch (e) {}
  return name;
};

const flag = (cc) =>
  cc && cc.length === 2
    ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : "🏳️";

const get = (url, policy) =>
  new Promise((resolve, reject) => {
    const opts = { url, timeout: 8, headers: { "User-Agent": "Mozilla/5.0" } };
    if (policy) opts.policy = policy;
    $httpClient.get(opts, (err, resp, data) => (err ? reject(err) : resolve(data)));
  });

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
  let raw;
  try {
    raw = await get("https://my.ippure.com/v1/info", policy);
  } catch (e) {
    // 策略不存在时，退回按分流规则请求
    if (policy && policy !== "DIRECT" && /exist/i.test(String((e && e.message) || e))) {
      raw = await get("https://my.ippure.com/v1/info", undefined);
    } else {
      throw e;
    }
  }
  const d = JSON.parse(raw);
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
  const proxyPolicy = resolvePolicy(proxyArg);
  const onlyDirect = proxyPolicy === "DIRECT";

  const directT = { label: "直连", policy: "DIRECT" };
  const proxyT = {
    label: proxyPolicy ? `节点 · ${proxyArg}` : "节点 · 按分流规则",
    policy: proxyPolicy,
  };
  const targets =
    mode === "direct" || onlyDirect
      ? [directT]
      : mode === "proxy"
      ? [proxyT]
      : [directT, proxyT];

  const single = targets.length === 1;
  const title = single ? `IP 纯净度 · ${targets[0].label}` : "IP 纯净度";

  const results = await Promise.allSettled(targets.map((t) => query(t.policy)));

  const blocks = [];
  let worst = null;
  results.forEach((res, i) => {
    const head = single ? [] : [`【${targets[i].label}】`];
    if (res.status === "fulfilled") {
      blocks.push([...head, ...res.value.lines].join("\n"));
      if (!worst || res.value.score > worst.score) worst = res.value;
    } else {
      const msg = (res.reason && res.reason.message) || res.reason;
      blocks.push([...head, `🌫️ 检测失败：${msg}`].join("\n"));
    }
  });

  if (!worst) {
    $done({
      title,
      content: blocks.join("\n\n"),
      icon: "xmark.circle",
      "icon-color": "#FF3B30",
    });
    return;
  }

  // 图标和颜色跟随风险更高的那个（单面板时就是它自己的）
  $done({
    title,
    content: blocks.join("\n\n"),
    icon: worst.r.icon,
    "icon-color": worst.r.color,
  });
})();
