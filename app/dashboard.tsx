"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type CsvRow = Record<string, string>;
type DataRow = {
  orderId: string;
  date: string;
  month: string;
  channel: string;
  category: string;
  product: string;
  sales: number;
  cost: number;
  profit: number;
  status: string;
};

const aliases = {
  orderId: ["order_id", "orderid", "订单号", "订单编号", "单号"],
  date: ["order_date", "date", "订单日期", "下单日期", "日期"],
  month: ["order_month", "month", "月份", "订单月份"],
  channel: ["channel", "sales_channel", "渠道", "销售渠道", "平台"],
  category: ["category", "product_category", "商品类别", "品类", "类别"],
  product: ["product_name", "product", "sku_name", "商品名称", "产品名称", "单品"],
  sales: ["sales_amount", "sales", "revenue", "amount", "销售额", "成交金额", "实付金额"],
  cost: ["cost_amount", "cost", "成本额", "成本", "商品成本"],
  profit: ["gross_profit", "profit", "毛利额", "毛利"],
  status: ["payment_status", "order_status", "status", "支付状态", "订单状态"],
  unitPrice: ["unit_price", "price", "单价", "售价"],
  quantity: ["quantity", "qty", "销量", "数量"],
  discount: ["discount_rate", "discount", "折扣率", "折扣"],
} as const;

type FieldKey = keyof typeof aliases;

const fieldLabels: Record<FieldKey, string> = {
  orderId: "订单编号",
  date: "订单日期",
  month: "月份",
  channel: "销售渠道",
  category: "商品类别",
  product: "商品名称",
  sales: "销售额",
  cost: "成本额",
  profit: "毛利额",
  status: "订单状态",
  unitPrice: "商品单价",
  quantity: "商品数量",
  discount: "折扣率",
};

const requiredFields: FieldKey[] = ["orderId", "date", "channel", "category", "product"];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s\-（）()]/g, "_").replace(/_+/g, "_");
}

function parseCsv(text: string): CsvRow[] {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) table.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) table.push(row);
  if (table.length < 2) return [];

  const headers = table[0].map((header, index) => header || `column_${index + 1}`);
  return table.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

function detectFields(headers: string[]) {
  const normalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const result = {} as Partial<Record<FieldKey, string>>;
  (Object.keys(aliases) as FieldKey[]).forEach((key) => {
    const exact = aliases[key].find((alias) => normalized.has(normalizeHeader(alias)));
    if (exact) result[key] = normalized.get(normalizeHeader(exact));
  });
  return result;
}

function numberValue(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.replace(/[￥¥$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthFromDate(date: string) {
  const match = date.match(/(\d{4})[-/.年](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : date.slice(0, 7);
}

function transformRows(rows: CsvRow[], fields: Partial<Record<FieldKey, string>>) {
  return rows.map((row, index): DataRow => {
    const get = (key: FieldKey) => (fields[key] ? row[fields[key]!] ?? "" : "");
    const unitPrice = numberValue(get("unitPrice"));
    const quantity = numberValue(get("quantity")) || 1;
    const discountRaw = numberValue(get("discount"));
    const discount = discountRaw > 1 ? discountRaw / 100 : discountRaw;
    const suppliedSales = numberValue(get("sales"));
    const sales = suppliedSales || unitPrice * quantity * (discount ? 1 - discount : 1);
    const cost = numberValue(get("cost"));
    const suppliedProfit = numberValue(get("profit"));
    const profit = suppliedProfit || (cost ? sales - cost : 0);
    const date = get("date");
    return {
      orderId: get("orderId") || `ROW-${index + 1}`,
      date,
      month: get("month") || monthFromDate(date),
      channel: get("channel") || "未分类渠道",
      category: get("category") || "未分类商品",
      product: get("product") || "未命名商品",
      sales,
      cost,
      profit,
      status: get("status"),
    };
  });
}

function isValidOrder(status: string) {
  if (!status) return true;
  return !/取消|退款|退货|关闭|失败|cancel|refund|return|closed|fail/i.test(status);
}

function money(value: number, compact = false) {
  if (compact && Math.abs(value) >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function shortNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return Math.round(value).toString();
}

const groupSum = (rows: DataRow[], key: keyof DataRow, value: "sales" | "profit" = "sales") => {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(String(row[key]), (map.get(String(row[key])) ?? 0) + row[value]));
  return [...map.entries()].map(([name, amount]) => ({ name, amount }));
};

function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    home: "⌂",
    overview: "◫",
    trend: "↗",
    channel: "◎",
    product: "◇",
    data: "▤",
    help: "?",
  };
  return <span className="navIcon" aria-hidden="true">{icons[name]}</span>;
}

function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (!points.length) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const range = max - min || 1;
  const coords = points.map((value, index) => {
    const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const y = 31 - ((value - min) / range) * 24;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 36" className="sparkline" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LineChart({
  data,
  color,
  formatter = shortNumber,
}: {
  data: { name: string; amount: number }[];
  color: string;
  formatter?: (value: number) => string;
}) {
  const width = 640;
  const height = 218;
  const pad = { left: 50, right: 18, top: 22, bottom: 34 };
  const maxValue = Math.max(...data.map((item) => item.amount), 1) * 1.15;
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const points = data.map((item, index) => ({
    ...item,
    x: pad.left + (data.length === 1 ? chartW / 2 : (index / (data.length - 1)) * chartW),
    y: pad.top + chartH - (item.amount / maxValue) * chartH,
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = points.length
    ? `${pad.left},${pad.top + chartH} ${polyline} ${points.at(-1)!.x},${pad.top + chartH}`
    : "";
  return (
    <div className="lineChart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="月度趋势图">
        <defs>
          <linearGradient id={`fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad.top + chartH * ratio;
          const value = maxValue * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#edf0f5" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="axisLabel">{formatter(value)}</text>
            </g>
          );
        })}
        {points.length > 1 && <polygon points={area} fill={`url(#fill-${color.replace("#", "")})`} />}
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <g key={point.name}>
            <circle cx={point.x} cy={point.y} r="4.5" fill="#fff" stroke={color} strokeWidth="3">
              <title>{point.name}：{formatter(point.amount)}</title>
            </circle>
            <text x={point.x} y={height - 10} textAnchor="middle" className="axisLabel">
              {point.name.replace(/^\d{4}-/, "")}月
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function HorizontalBars({
  data,
  color = "#3985f6",
  compact = false,
}: {
  data: { name: string; amount: number }[];
  color?: string;
  compact?: boolean;
}) {
  const max = Math.max(...data.map((item) => item.amount), 1);
  return (
    <div className={`barList ${compact ? "compact" : ""}`}>
      {data.map((item, index) => (
        <div className="barRow" key={item.name}>
          <span className="barName" title={item.name}>{item.name}</span>
          <div className="barTrack">
            <span style={{ width: `${Math.max((item.amount / max) * 100, 2)}%`, background: color }} />
          </div>
          <strong>{money(item.amount, true)}</strong>
          {compact && <i>{String(index + 1).padStart(2, "0")}</i>}
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fields, setFields] = useState<Partial<Record<FieldKey, string>>>({});
  const [filename, setFilename] = useState("示例销售数据.csv");
  const [rawCount, setRawCount] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [channel, setChannel] = useState("全部");
  const [category, setCategory] = useState("全部");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [trendSlide, setTrendSlide] = useState(0);
  const [analysisSlide, setAnalysisSlide] = useState(0);

  useEffect(() => {
    const trendTimer = window.setInterval(() => {
      setTrendSlide((current) => (current + 1) % 2);
    }, 5000);
    const analysisTimer = window.setInterval(() => {
      setAnalysisSlide((current) => (current + 1) % 3);
    }, 4000);
    return () => {
      window.clearInterval(trendTimer);
      window.clearInterval(analysisTimer);
    };
  }, []);

  const loadText = (text: string, name: string) => {
    const raw = parseCsv(text);
    if (!raw.length) throw new Error("没有读取到有效数据，请检查 CSV 是否包含表头和数据行。");
    const detected = detectFields(Object.keys(raw[0]));
    if (!detected.sales && !(detected.unitPrice && detected.quantity)) {
      throw new Error("未找到销售额字段，也无法通过单价 × 数量推算。");
    }
    const missing = requiredFields.filter((key) => !detected[key]);
    if (missing.length) {
      throw new Error(`缺少关键字段：${missing.map((key) => fieldLabels[key]).join("、")}`);
    }
    const transformed = transformRows(raw, detected);
    setRows(transformed);
    setFields(detected);
    setRawCount(raw.length);
    setFilename(name);
    setChannel("全部");
    setCategory("全部");
    const months = [...new Set(transformed.map((row) => row.month).filter(Boolean))].sort();
    setStartMonth(months[0] ?? "");
    setEndMonth(months.at(-1) ?? "");
    setError("");
  };

  useEffect(() => {
    fetch("/demo-data.csv")
      .then((response) => response.text())
      .then((text) => loadText(text, "示例销售数据.csv"))
      .catch(() => setError("示例数据加载失败，请上传 CSV 文件开始分析。"))
      .finally(() => setLoading(false));
  }, []);

  const readFile = (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("请选择 .csv 格式的数据文件。");
      return;
    }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadText(String(reader.result ?? ""), file.name);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "CSV 解析失败。");
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError("文件读取失败，请重试。");
      setLoading(false);
    };
    reader.readAsText(file, "UTF-8");
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    readFile(event.dataTransfer.files[0]);
  };

  const validRows = useMemo(() => rows.filter((row) => isValidOrder(row.status)), [rows]);
  const channels = useMemo(() => [...new Set(validRows.map((row) => row.channel))].sort(), [validRows]);
  const categories = useMemo(() => [...new Set(validRows.map((row) => row.category))].sort(), [validRows]);
  const months = useMemo(() => [...new Set(validRows.map((row) => row.month).filter(Boolean))].sort(), [validRows]);

  const filtered = useMemo(() => validRows.filter((row) => {
    if (channel !== "全部" && row.channel !== channel) return false;
    if (category !== "全部" && row.category !== category) return false;
    if (startMonth && row.month < startMonth) return false;
    if (endMonth && row.month > endMonth) return false;
    return true;
  }), [validRows, channel, category, startMonth, endMonth]);

  const stats = useMemo(() => {
    const sales = filtered.reduce((sum, row) => sum + row.sales, 0);
    const profit = filtered.reduce((sum, row) => sum + row.profit, 0);
    const orderCount = new Set(filtered.map((row) => row.orderId)).size;
    return {
      sales,
      profit,
      orderCount,
      margin: sales ? (profit / sales) * 100 : 0,
      aov: orderCount ? sales / orderCount : 0,
    };
  }, [filtered]);

  const monthlySales = useMemo(() => groupSum(filtered, "month").sort((a, b) => a.name.localeCompare(b.name)), [filtered]);
  const monthlyOrders = useMemo(() => {
    const map = new Map<string, Set<string>>();
    filtered.forEach((row) => {
      if (!map.has(row.month)) map.set(row.month, new Set());
      map.get(row.month)!.add(row.orderId);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, values]) => ({ name, amount: values.size }));
  }, [filtered]);
  const channelSales = useMemo(() => groupSum(filtered, "channel").sort((a, b) => b.amount - a.amount), [filtered]);
  const categorySales = useMemo(() => groupSum(filtered, "category").sort((a, b) => b.amount - a.amount).slice(0, 8), [filtered]);

  const palette = ["#3479f6", "#29b88a", "#8a6cf6", "#ff9c52", "#56b4e9", "#f05d7b", "#c9a227"];
  const donutTotal = channelSales.reduce((sum, item) => sum + item.amount, 0) || 1;
  const donut = channelSales.map((item, index) => {
    const start = channelSales
      .slice(0, index)
      .reduce((sum, entry) => sum + (entry.amount / donutTotal) * 100, 0);
    const end = start + (item.amount / donutTotal) * 100;
    return `${palette[index % palette.length]} ${start}% ${end}%`;
  }).join(", ");

  const resetFilters = () => {
    setChannel("全部");
    setCategory("全部");
    setStartMonth(months[0] ?? "");
    setEndMonth(months.at(-1) ?? "");
  };

  const kpis = [
    { label: "销售额", value: money(stats.sales), tone: "blue", delta: "有效订单收入", spark: monthlySales.map((item) => item.amount) },
    { label: "订单量", value: stats.orderCount.toLocaleString("zh-CN"), tone: "indigo", delta: "去重订单数", spark: monthlyOrders.map((item) => item.amount) },
    { label: "毛利额", value: money(stats.profit), tone: "green", delta: "销售额 − 成本", spark: monthlySales.map((_, index) => monthlySales[index]?.amount * (stats.margin / 100)) },
    { label: "毛利率", value: `${stats.margin.toFixed(2)}%`, tone: "orange", delta: "毛利额 / 销售额", spark: monthlySales.map(() => stats.margin) },
    { label: "客单价", value: money(stats.aov), tone: "violet", delta: "销售额 / 订单量", spark: monthlySales.map((item, index) => item.amount / Math.max(monthlyOrders[index]?.amount ?? 1, 1)) },
  ];

  const recognizedCount = Object.values(fields).filter(Boolean).length;

  return (
    <main
      className={`dashboardShell ${dragging ? "isDragging" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <span className="brandMark"><i /><i /><i /><i /><i /><i /><i /><i /><i /></span>
          <div><strong>数览 BI</strong><small>DATA VISION</small></div>
        </div>
        <nav>
          <p>工作台</p>
          <a className="active" href="#overview"><Icon name="home" />经营总览</a>
          <a href="#kpi"><Icon name="overview" />核心指标</a>
          <a href="#trend"><Icon name="trend" />趋势分析</a>
          <a href="#channel"><Icon name="channel" />渠道分析</a>
          <a href="#product"><Icon name="product" />商品分析</a>
          <p>数据中心</p>
          <button onClick={() => fileInput.current?.click()}><Icon name="data" />导入数据</button>
          <button onClick={() => setMappingOpen(true)}><Icon name="help" />字段识别</button>
        </nav>
        <div className="sideStatus">
          <span className="statusDot" />
          <div><strong>数据已就绪</strong><small>{rawCount.toLocaleString()} 行原始数据</small></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="menuButton" onClick={() => setMobileNav(!mobileNav)} aria-label="展开导航">☰</button>
          <div className="crumb"><span>数据看板</span><b>/</b><strong>电商销售经营看板</strong></div>
          <div className="topActions">
            <span className="liveBadge"><i /> 实时分析</span>
            <button className="ghostButton" onClick={() => setMappingOpen(true)}>识别 {recognizedCount} 个字段</button>
            <button className="uploadButton" onClick={() => fileInput.current?.click()}>
              <span>↑</span> 上传 CSV
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => readFile(event.target.files?.[0])}
            />
          </div>
        </header>

        <div className="content" id="overview">
          <section className="heroRow">
            <div>
              <p className="eyebrow">E-COMMERCE PERFORMANCE</p>
              <h1>电商销售经营看板</h1>
              <p className="subtitle">聚合销售、订单、渠道与商品表现，快速定位增长机会。</p>
            </div>
            <div className="dataSource">
              <span className="fileGlyph">CSV</span>
              <div><small>当前数据源</small><strong title={filename}>{filename}</strong></div>
              <em>{filtered.length.toLocaleString()} 条有效记录</em>
            </div>
          </section>

          {error && <div className="errorBanner"><span>!</span>{error}<button onClick={() => fileInput.current?.click()}>重新上传</button></div>}

          <section className="filters" aria-label="数据筛选">
            <div className="filterGroup">
              <label>月份范围</label>
              <div className="monthRange">
                <select value={startMonth} onChange={(event) => setStartMonth(event.target.value)}>
                  {months.map((month) => <option value={month} key={month}>{month}</option>)}
                </select>
                <span>至</span>
                <select value={endMonth} onChange={(event) => setEndMonth(event.target.value)}>
                  {months.map((month) => <option value={month} key={month}>{month}</option>)}
                </select>
              </div>
            </div>
            <div className="filterGroup">
              <label>销售渠道</label>
              <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                <option>全部</option>
                {channels.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="filterGroup">
              <label>商品类别</label>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option>全部</option>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <button className="resetButton" onClick={resetFilters}>↻ 重置筛选</button>
          </section>

          <section className="kpiGrid" id="kpi">
            {kpis.map((kpi) => (
              <article className={`kpiCard ${kpi.tone}`} key={kpi.label}>
                <div className="kpiTop"><span>{kpi.label}</span><i>↗</i></div>
                <strong>{loading ? "—" : kpi.value}</strong>
                <div className="kpiBottom"><small>{kpi.delta}</small><MiniSparkline points={kpi.spark} color={`var(--${kpi.tone})`} /></div>
              </article>
            ))}
          </section>

          <section className="dashboardStage" id="trend">
            <div className="carouselColumn trendCarousel" aria-live="polite">
              <article className={`panel carouselLayer ${trendSlide === 0 ? "active" : ""}`} aria-hidden={trendSlide !== 0}>
                <div className="panelHeader">
                  <div><p>趋势分析</p><h2>月度销售额趋势</h2></div>
                  <span className="legend"><i style={{ background: "#3479f6" }} />销售额（元）</span>
                </div>
                <LineChart data={monthlySales} color="#3479f6" />
              </article>
              <article className={`panel carouselLayer ${trendSlide === 1 ? "active" : ""}`} aria-hidden={trendSlide !== 1}>
                <div className="panelHeader">
                  <div><p>趋势分析</p><h2>月度订单量趋势</h2></div>
                  <span className="legend"><i style={{ background: "#8a6cf6" }} />订单量</span>
                </div>
                <LineChart data={monthlyOrders} color="#8a6cf6" formatter={(value) => `${Math.round(value)}`} />
              </article>
              <div className="carouselDots" aria-label="趋势图轮播进度">
                {[0, 1].map((index) => (
                  <button
                    className={trendSlide === index ? "active" : ""}
                    key={index}
                    onClick={() => setTrendSlide(index)}
                    aria-label={`查看第 ${index + 1} 张趋势图`}
                  />
                ))}
              </div>
            </div>

            <div className="carouselColumn analysisCarousel" id="channel" aria-live="polite">
              <article className={`panel carouselLayer ${analysisSlide === 0 ? "active" : ""}`} aria-hidden={analysisSlide !== 0}>
                <div className="panelHeader">
                  <div><p>渠道分析</p><h2>各渠道销售额</h2></div>
                  <span className="unit">单位：元</span>
                </div>
                <HorizontalBars data={channelSales} />
              </article>
              <article className={`panel carouselLayer donutPanel ${analysisSlide === 1 ? "active" : ""}`} aria-hidden={analysisSlide !== 1}>
                <div className="panelHeader">
                  <div><p>渠道分析</p><h2>渠道销售额占比</h2></div>
                </div>
                <div className="donutWrap">
                  <div className="donut" style={{ background: `conic-gradient(${donut || "#e9edf3 0 100%"})` }}>
                    <div><small>销售总额</small><strong>{money(stats.sales, true)}</strong></div>
                  </div>
                  <div className="donutLegend">
                    {channelSales.map((item, index) => (
                      <div key={item.name}>
                        <span><i style={{ background: palette[index % palette.length] }} />{item.name}</span>
                        <strong>{((item.amount / donutTotal) * 100).toFixed(1)}%</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
              <article className={`panel carouselLayer ${analysisSlide === 2 ? "active" : ""}`} id="product" aria-hidden={analysisSlide !== 2}>
                <div className="panelHeader">
                  <div><p>商品分析</p><h2>商品类别销售额排行</h2></div>
                </div>
                <HorizontalBars data={categorySales} color="#29b88a" compact />
              </article>
              <div className="carouselDots" aria-label="分析图轮播进度">
                {[0, 1, 2].map((index) => (
                  <button
                    className={analysisSlide === index ? "active" : ""}
                    key={index}
                    onClick={() => setAnalysisSlide(index)}
                    aria-label={`查看第 ${index + 1} 张分析图`}
                  />
                ))}
              </div>
            </div>
          </section>

          <footer>
            <span><i className="statusDot" /> 数据分析完成</span>
            <p>共识别 {recognizedCount} 个字段 · {rawCount.toLocaleString()} 行原始数据 · 已自动排除无效订单</p>
          </footer>
        </div>
      </section>

      {dragging && (
        <div className="dropOverlay">
          <div><span>↑</span><h2>松开即可分析 CSV</h2><p>系统将自动识别字段并刷新全部图表</p></div>
        </div>
      )}

      {mappingOpen && (
        <div className="modalBackdrop" onClick={() => setMappingOpen(false)}>
          <section className="mappingModal" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div><p>SMART MAPPING</p><h2>字段识别结果</h2></div>
              <button onClick={() => setMappingOpen(false)} aria-label="关闭">×</button>
            </div>
            <p className="modalLead">系统已将 CSV 表头自动匹配到看板指标。兼容常见中文及英文字段名。</p>
            <div className="mappingList">
              {(Object.keys(fieldLabels) as FieldKey[]).map((key) => (
                <div key={key}>
                  <span>{fieldLabels[key]}</span>
                  <b>{fields[key] ?? "未识别"}</b>
                  <i className={fields[key] ? "ok" : ""}>{fields[key] ? "✓" : "—"}</i>
                </div>
              ))}
            </div>
            <button className="modalUpload" onClick={() => { setMappingOpen(false); fileInput.current?.click(); }}>上传另一份 CSV</button>
          </section>
        </div>
      )}
    </main>
  );
}
