"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Download, MapPin, Sparkles, Ticket, Bookmark, Trash2 } from "lucide-react";


type SavedTicket = {
  id: number;
  oshi: string;
  event: string;
  origin: string;
  destination: string;
  date: string;
  color: string;
  memory: string;
  image: string;
};

const prefectures = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

const colors = [
  { name: "ピンク", value: "#ed83aa" },
  { name: "ブルー", value: "#65a9e8" },
  { name: "パープル", value: "#a48ae8" },
  { name: "レッド", value: "#e66b75" },
  { name: "イエロー", value: "#e9c45d" },
  { name: "グリーン", value: "#71b99a" },
  { name: "オレンジ", value: "#e99a5b" },
  { name: "ホワイト", value: "#d8d8d8" },
];

function hashString(value: string) {
  return [...value].reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 7);
}


type Position = [number, number];

type GeoGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

type GeoFeature = {
  properties: { N03_001: string };
  geometry: GeoGeometry;
};

type GeoJSONData = {
  features: GeoFeature[];
};

function geometryToSvgPath(geometry: GeoGeometry, width: number, height: number) {
  const allPolygons =
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.coordinates;

  // MultiPolygonの場合は面積が大きい順に並べる
  // 東京のように離島を含む場合、本土部分を優先して表示する
  const polygonArea = (polygon: Position[][]) => {
    const ring = polygon[0];
    if (!ring || ring.length < 3) return 0;

    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
  };

  const sortedPolygons = [...allPolygons].sort(
    (a, b) => polygonArea(b) - polygonArea(a)
  );

  // 最大の地形を表示対象にする
  const polygons =
    geometry.type === "MultiPolygon"
      ? sortedPolygons.slice(0, 1)
      : sortedPolygons;

  const points = polygons.flat(2) as Position[];

  if (!points.length) return "";

  const longitudes = points.map((p) => p[0]);
  const latitudes = points.map((p) => p[1]);

  const minX = Math.min(...longitudes);
  const maxX = Math.max(...longitudes);
  const minY = Math.min(...latitudes);
  const maxY = Math.max(...latitudes);

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const padding = 3;

  const scale = Math.min(
    (width - padding * 2) / rangeX,
    (height - padding * 2) / rangeY
  );

  const offsetX = (width - rangeX * scale) / 2;
  const offsetY = (height - rangeY * scale) / 2;

  return polygons
    .map((polygon) =>
      polygon
        .map((ring) =>
          ring
            .map(([x, y], index) => {
              const px = (x - minX) * scale + offsetX;
              const py = (maxY - y) * scale + offsetY;
              return `${index === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
            })
            .join(" ") + " Z"
        )
        .join(" ")
    )
    .join(" ");
}

export default function Home() {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("東京都");
  const [destination, setDestination] = useState("大阪府");
  const [oshi, setOshi] = useState("My Oshi");
  const [event, setEvent] = useState("SPECIAL LIVE 2026");
  const [date, setDate] = useState("2026-11-06");
  const [memory, setMemory] = useState("忘れられない一日。");
  const [color, setColor] = useState("#a48ae8");
  const [downloading, setDownloading] = useState(false);
  const [savedTickets, setSavedTickets] = useState<SavedTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SavedTicket | null>(null);
  const [savingTicket, setSavingTicket] = useState(false);


  const [mapFeatures, setMapFeatures] = useState<GeoFeature[]>([]);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("oshi-journey-collection");
      if (saved) setSavedTickets(JSON.parse(saved));
    } catch (error) {
      console.error("コレクションの読み込みに失敗しました", error);
    }
  }, []);

  useEffect(() => {
    fetch("/data/prefectures.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("地図データを読み込めません");
        return response.json();
      })
      .then((data: GeoJSONData) => setMapFeatures(data.features))
      .catch((error) => {
        console.error(error);
        setMapError(true);
      });
  }, []);

  const originFeature = useMemo(
    () => mapFeatures.find((feature) => feature.properties.N03_001 === origin),
    [mapFeatures, origin]
  );

  const destinationFeature = useMemo(
    () => mapFeatures.find((feature) => feature.properties.N03_001 === destination),
    [mapFeatures, destination]
  );

  const originPath = originFeature
    ? geometryToSvgPath(originFeature.geometry, 58, 88)
    : "";

  const destinationPath = destinationFeature
    ? geometryToSvgPath(destinationFeature.geometry, 58, 88)
    : "";


  const seed = useMemo(
    () => hashString(`${origin}-${destination}-${oshi}-${event}`),
    [origin, destination, oshi, event]
  );

  const formattedDate = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "日付未設定";

  const saveTicket = async () => {
    if (!ticketRef.current || savingTicket) return;

    setSavingTicket(true);
    try {
      const image = await toPng(ticketRef.current, {
        pixelRatio: 1,
        cacheBust: true,
        backgroundColor: "#fffdf9",
      });

      const ticket: SavedTicket = {
        id: Date.now(),
        oshi,
        event,
        origin,
        destination,
        date,
        color,
        memory,
        image,
      };

      const updated = [ticket, ...savedTickets];
      localStorage.setItem("oshi-journey-collection", JSON.stringify(updated));
      setSavedTickets(updated);
      alert("マイコレクションに保存しました！");
    } catch (error) {
      console.error(error);
      alert("保存できませんでした。ブラウザの保存容量を確認してください。");
    } finally {
      setSavingTicket(false);
    }
  };

  const deleteTicket = (id: number) => {
    if (!confirm("このチケットを削除しますか？")) return;

    const updated = savedTickets.filter((ticket) => ticket.id !== id);
    localStorage.setItem("oshi-journey-collection", JSON.stringify(updated));
    setSavedTickets(updated);
  };

  const downloadTicket = async () => {
    if (!ticketRef.current) return;
    setDownloading(true);

    try {
      const dataUrl = await toPng(ticketRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#fffdf9",
      });
      const link = document.createElement("a");
      link.download = `oshi-ticket-${date || "memory"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error(error);
      alert("画像の保存に失敗しました。もう一度お試しください。");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className={"page"}>
      <header className={"header"}>
        <div className={"logo"}>
          <span className={"logoIcon"}><Ticket size={21} /></span>
          <span>OSHI JOURNEY</span>
        </div>
        <span className={"headerTag"}>YOUR MEMORY, YOUR TICKET.</span>
      </header>

      <section className={"hero"}>
        <div className={"eyebrow"}><Sparkles size={14} /> A TICKET OF YOUR STORY</div>
        <h1>推しとの思い出を、<br /><span>一枚のチケットに。</span></h1>
        <p>ライブも、聖地巡礼も、遠征も。<br />あの日の旅を、世界に一つだけの記念チケットに残そう。</p>
      </section>

      <div className={"workspace"}>
        <section className={"formPanel"}>
          <div className={"sectionHeading"}>
            <span className={"step"}>01</span>
            <div>
              <h2>チケットをつくる</h2>
              <p>思い出の情報を入力してください。</p>
            </div>
          </div>

          <div className={"field"}>
            <label htmlFor="origin">出発地</label>
            <div className={"selectWrap"}>
              <MapPin size={16} />
              <select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)}>
                {prefectures.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className={"field"}>
            <label htmlFor="destination">目的地</label>
            <div className={"selectWrap"}>
              <MapPin size={16} />
              <select id="destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
                {prefectures.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className={"field"}>
            <label htmlFor="oshi">推しの名前・グループ名</label>
            <input id="oshi" value={oshi} onChange={(e) => setOshi(e.target.value)} placeholder="例：〇〇、〇〇グループ" maxLength={35} />
          </div>

          <div className={"field"}>
            <label htmlFor="event">イベント・ライブ名</label>
            <input id="event" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="例：〇〇 LIVE TOUR 2026" maxLength={40} />
          </div>

          <div className={"field"}>
            <label htmlFor="date">思い出の日付</label>
            <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className={"field"}>
            <label>推しカラー</label>
            <div className={"colorList"}>
              {colors.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={color === c.value}
                  className={`${"colorButton"} ${color === c.value ? "colorSelected" : ""}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setColor(c.value)}
                />
              ))}
            </div>
          </div>

          <div className={"field"}>
            <label htmlFor="memory">思い出のひとこと</label>
            <textarea id="memory" value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="あの日の思い出を一言で..." maxLength={55} rows={3} />
          </div>
        </section>

        <section className={"previewPanel"}>
          <div className={"sectionHeading"}>
            <span className={"step"}>02</span>
            <div>
              <h2>チケットプレビュー</h2>
              <p>入力するとリアルタイムで反映されます。</p>
            </div>
          </div>

          <div className={"ticketStage"}>
            <div className={"ticket"} ref={ticketRef}>
              <div className={"ticketMain"}>
                <div className={"ticketTop"}>
                  <span className={"ticketBrand"}>OSHI JOURNEY</span>
                  <span className={"ticketNumber"}>NO. {String(seed % 99999).padStart(5, "0")}</span>
                </div>

                <div className={"ticketTitle"}>MY MEMORY TICKET</div>
                <div className={"ticketSubtitle"}>A JOURNEY TO MEET MY OSHI</div>

                <div className={"route"}>
                  <div>
                    <span className={"routeLabel"}>FROM</span>
                    <strong>{origin.replace(/[都道府県]/g, "")}</strong>
                    <small>{origin}</small>
                  </div>
                  <div className={"routeLine"}>
                    <span>✦</span>
                    <div />
                    <span>✦</span>
                  </div>
                  <div className={"routeDestination"}>
                    <span className={"routeLabel"}>TO</span>
                    <strong>{destination.replace(/[都道府県]/g, "")}</strong>
                    <small>{destination}</small>
                  </div>
                </div>

                <div className={"ticketInfo"}>
                  <div>
                    <span>ARTIST / OSHI</span>
                    <strong>{oshi || "—"}</strong>
                  </div>
                  <div>
                    <span>EVENT</span>
                    <strong>{event || "—"}</strong>
                  </div>
                  <div>
                    <span>DATE</span>
                    <strong>{formattedDate}</strong>
                  </div>
                </div>

                <div className={"patternArea"}>
                  <svg viewBox="0 0 135 135" className={"patternSvg"} aria-label="出発地と目的地の実際の地図">
                    <defs>
                      <pattern id="dots" width="8" height="8" patternUnits="userSpaceOnUse">
                        <circle cx="1" cy="1" r="0.8" fill={color} opacity="0.25" />
                      </pattern>
                    </defs>

                    <rect width="135" height="135" fill="url(#dots)" />
                    {Array.from({ length: 22 }, (_, index) => {
                      const x = ((seed * (index + 3) * 17) % 127) + 4;
                      const y = ((seed * (index + 5) * 23) % 127) + 4;
                      const radius = ((seed + index * 7) % 3) + 0.8;

                      return (
                        <circle
                          key={`decoration-${index}`}
                          cx={x}
                          cy={y}
                          r={radius}
                          fill={index % 2 === 0 ? color : "#8875bd"}
                          opacity="0.22"
                        />
                      );
                    })}

                    <g transform="translate(4 15)">
                      <path
                        d={originPath}
                        fill={color}
                        fillOpacity="0.18"
                        stroke={color}
                        strokeWidth="0.8"
                        strokeLinejoin="round"
                        fillRule="evenodd"
                      />
                    </g>
                    <g transform="translate(73 15)">
                      <path
                        d={destinationPath}
                        fill="#8875bd"
                        fillOpacity="0.18"
                        stroke="#8875bd"
                        strokeWidth="0.8"
                        strokeLinejoin="round"
                        fillRule="evenodd"
                      />
                    </g>
                    <text x="33" y="112" textAnchor="middle" fontSize="7" fill={color} fontWeight="bold">FROM</text>
                    <text x="102" y="112" textAnchor="middle" fontSize="7" fill="#8875bd" fontWeight="bold">TO</text>
                    <path
                      d="M 55 57 Q 67 35 80 57"
                      fill="none"
                      stroke="#8875bd"
                      strokeWidth="1.4"
                      strokeDasharray="2.5 2"
                      strokeLinecap="round"
                    />
                    <circle cx="55" cy="57" r="2" fill={color} />
                    <circle cx="80" cy="57" r="2" fill="#8875bd" />
                    <text
                      x="67.5"
                      y="45"
                      textAnchor="middle"
                      fontSize="11"
                      fill="#8875bd"
                    >✈</text>
                  </svg>
                  <div className={"memoryText"}>
                    <span>THIS DAY, THIS JOURNEY</span>
                    <p>{memory || "大切な思い出をここに。"}</p>
                    <small>ONE JOURNEY, ONE STORY.</small>
                  </div>
                </div>

                <div className={"ticketFooter"}>
                  <span>KEEP THIS MEMORY FOREVER</span>
                  <span>✦ ✦ ✦</span>
                </div>
              </div>

              <div className={"ticketStub"} style={{ backgroundColor: color }}>
                <span className={"stubVertical"}>OSHI JOURNEY · MEMORY COLLECTION</span>
                <span className={"stubStar"}>✦</span>
                <span className={"stubDate"}>{date ? date.replaceAll("-", ".") : "2026.XX.XX"}</span>
              </div>
            </div>
          </div>

          <button
            className={"collectionSaveButton"}
            onClick={saveTicket}
            disabled={savingTicket}
          >
            <Bookmark size={18} />
            {savingTicket ? "保存中..." : "マイコレクションに保存"}
          </button>

          <button className={"downloadButton"} onClick={downloadTicket} disabled={downloading}>
            <Download size={18} />
            {downloading ? "画像を作成中..." : "チケットをPNGで保存"}
          </button>
          {mapError && <p className={"note"}>地図データを読み込めませんでした。ページを再読み込みしてください。</p>}
{!mapError && mapFeatures.length === 0 && <p className={"note"}>地図データを読み込み中...</p>}
<p className={"note"}>※これは思い出を記録するための記念チケットです。実際の入場券ではありません。</p>

          <div className={"collectionSection"}>
            <div className={"collectionHeading"}>
              <div>
                <span className={"collectionEyebrow"}>YOUR MEMORIES</span>
                <h2>MY COLLECTION</h2>
              </div>
              <span className={"collectionCount"}>{savedTickets.length} TICKETS</span>
            </div>

            {savedTickets.length === 0 ? (
              <div className={"collectionEmpty"}>
                <Ticket size={30} />
                <p>まだチケットがありません。</p>
                <span>お気に入りの思い出を保存して集めよう！</span>
              </div>
            ) : (
              <div className={"collectionGrid"}>
                {savedTickets.map((ticket) => (
                  <div
                    className={"collectionCard"}
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTicket(ticket);
                      }
                    }}
                  >
                    <img src={ticket.image} alt={`${ticket.event}の記念チケット`} />
                    <div className={"collectionCardInfo"}>
                      <strong>{ticket.event || "イベント名未設定"}</strong>
                      <span>{ticket.oshi || "推し未設定"}</span>
                      <small>{ticket.origin} → {ticket.destination}</small>
                      <small>{ticket.date || "日付未設定"}</small>
                    </div>
                    <button
                      className={"deleteTicketButton"}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteTicket(ticket.id);
                      }}
                      aria-label="チケットを削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedTicket && (
        <div
          className={"ticketModalOverlay"}
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className={"ticketModal"}
            role="dialog"
            aria-modal="true"
            aria-label="チケットの詳細"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={"ticketModalClose"}
              onClick={() => setSelectedTicket(null)}
              aria-label="閉じる"
            >
              ×
            </button>

            <span className={"collectionEyebrow"}>YOUR PRECIOUS MEMORY</span>
            <h2>MY TICKET</h2>

            <img
              className={"ticketModalImage"}
              src={selectedTicket.image}
              alt={`${selectedTicket.event}の記念チケット`}
            />

            <div className={"ticketModalDetails"}>
              <div>
                <span>ARTIST / OSHI</span>
                <strong>{selectedTicket.oshi || "未設定"}</strong>
              </div>
              <div>
                <span>EVENT</span>
                <strong>{selectedTicket.event || "未設定"}</strong>
              </div>
              <div>
                <span>DATE</span>
                <strong>{selectedTicket.date || "未設定"}</strong>
              </div>
              <div>
                <span>JOURNEY</span>
                <strong>{selectedTicket.origin} → {selectedTicket.destination}</strong>
              </div>
              <div className={"ticketModalMemory"}>
                <span>YOUR MEMORY</span>
                <p>{selectedTicket.memory || "大切な思い出"}</p>
              </div>
            </div>

            <button
              className={"ticketModalCloseButton"}
              onClick={() => setSelectedTicket(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <footer className={"footer"}>MADE FOR YOUR PRECIOUS MEMORIES. ✦</footer>
    </main>
  );
}
