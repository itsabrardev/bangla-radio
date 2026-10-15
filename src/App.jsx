import { useState, useRef, useEffect, useCallback } from "react";
import { categories, stationMeta } from "./data/stations";
import StationLogo from "./components/StationLogo";
import {
  PlayIcon, PauseIcon, SkipPrevIcon, SkipNextIcon,
  VolumeHighIcon, VolumeLowIcon, MuteIcon,
  SearchIcon, CloseIcon, RadioIcon,
  LiveDotIcon, WifiIcon, LoadingIcon,
} from "./components/Icons";
import "./App.css";

// ─── Radio Browser API ────────────────────────────────────────────────────────
const API_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

// Detect if running inside Electron (desktop EXE)
const isElectron = typeof window !== "undefined" &&
  window.navigator.userAgent.toLowerCase().includes("electron");

async function fetchBangladeshStations() {
  for (const server of API_SERVERS) {
    try {
      const res = await fetch(
        `${server}/json/stations/bycountrycodeexact/BD?limit=300&hidebroken=true&order=votes&reverse=true`,
        { headers: { "User-Agent": "BanglaRadioApp/1.0" } }
      );
      if (res.ok) return await res.json();
    } catch { continue; }
  }
  return [];
}

async function registerPlay(stationuuid) {
  try {
    await fetch(`${API_SERVERS[0]}/json/url/${stationuuid}`,
      { headers: { "User-Agent": "BanglaRadioApp/1.0" } });
  } catch {}
}

// Auto-extract frequency from station name (e.g. "Jago FM 94.4" → "94.4 FM")
function extractFreqFromName(name) {
  const m = name.match(/(\d{2,3}(?:\.\d+)?)\s*(?:FM|fm)/i);
  return m ? `${m[1]} FM` : "";
}

// Match API station to local metadata
function enrichStation(apiStation) {
  const nameLower = apiStation.name.toLowerCase();
  for (const meta of stationMeta) {
    if (
      nameLower.includes(meta.keyword) ||
      (meta.keyword2 && nameLower.includes(meta.keyword2))
    ) {
      return { ...apiStation, ...meta };
    }
  }
  // No metadata match — try to extract frequency from name
  const autoFreq = extractFreqFromName(apiStation.name);
  return {
    ...apiStation,
    frequency: autoFreq,
    category: autoFreq ? "বিনোদন" : "অনলাইন",
    color: "#4B5563",
  };
}

// ─── Media Session (OS notification / lock screen controls) ──────────────────
function setMediaSession(station, handlers) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.frequency ? `${station.frequency} • Bangladesh FM` : "Bangladesh Online Radio",
      album: "বাংলা রেডিও",
      artwork: station.favicon && station.favicon !== "null"
        ? [
            { src: station.favicon, sizes: "96x96", type: "image/png" },
            { src: station.favicon, sizes: "512x512", type: "image/png" },
          ]
        : [{ src: "/favicon.svg", sizes: "512x512", type: "image/svg+xml" }],
    });
    navigator.mediaSession.setActionHandler("play", handlers.play);
    navigator.mediaSession.setActionHandler("pause", handlers.pause);
    navigator.mediaSession.setActionHandler("previoustrack", handlers.prev);
    navigator.mediaSession.setActionHandler("nexttrack", handlers.next);
    navigator.mediaSession.setActionHandler("stop", handlers.pause);
  } catch {}
}

function setMediaSessionState(playing) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  } catch {}
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [allStations, setAllStations] = useState([]);
  const [currentStation, setCurrentStation] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("সব");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [fetchError, setFetchError] = useState(false);

  const audioRef = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch + deduplicate stations
  useEffect(() => {
    setIsFetching(true);
    fetchBangladeshStations()
      .then((data) => {
        const nameMap = new Map();
        for (const s of data) {
          const streamUrl = s.url_resolved || s.url || "";
          if (!streamUrl) continue;

          // Web: HTTPS streams only (browser blocks HTTP on HTTPS pages)
          // Electron desktop: allow all (webSecurity: false)
          if (!isElectron && !streamUrl.startsWith("https://")) continue;

          const enriched = enrichStation(s);
          const key = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          const existing = nameMap.get(key);
          if (!existing || s.votes > existing.votes) {
            nameMap.set(key, enriched);
          }
        }
        setAllStations([...nameMap.values()]);
        setIsFetching(false);
      })
      .catch(() => { setFetchError(true); setIsFetching(false); });
  }, []);

  // Filtered stations
  const filteredStations = allStations.filter((s) => {
    const matchCat = selectedCategory === "সব" || s.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      s.name.toLowerCase().includes(q) ||
      s.frequency.includes(q) ||
      (s.tags && s.tags.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  // ─── Play ──────────────────────────────────────────────────────────────────
  const skipStationRef = useRef(null);

  const playStation = useCallback(async (station) => {
    setError(null);
    setIsLoading(true);
    setCurrentStation(station);
    setIsPlaying(false);
    setMediaSessionState(false);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    const url = station.url_resolved || station.url;
    const audio = new Audio();
    audio.volume = isMuted ? 0 : volume;
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    audio.oncanplay = () => {
      setIsLoading(false);
      audio.play()
        .then(() => {
          setIsPlaying(true);
          setMediaSessionState(true);
          registerPlay(station.stationuuid);
        })
        .catch(() => {
          setError("অটোপ্লে blocked। Play চাপুন।");
          setIsLoading(false);
        });
    };

    audio.onplaying = () => { setIsPlaying(true); setIsLoading(false); setMediaSessionState(true); };
    audio.onpause = () => { setIsPlaying(false); setMediaSessionState(false); };

    audio.onerror = () => {
      setError(`"${station.name}" এর stream চলছে না। অন্য স্টেশন চেষ্টা করুন।`);
      setIsLoading(false);
      setIsPlaying(false);
      setMediaSessionState(false);
    };

    audio.onwaiting = () => setIsLoading(true);
    audio.onstalled = () => {
      setTimeout(() => {
        if (audioRef.current === audio) { audio.load(); audio.play().catch(() => {}); }
      }, 5000);
    };

    audio.src = url;
    audio.load();

    // Media Session metadata + controls
    setMediaSession(station, {
      play: () => { audioRef.current?.play(); setIsPlaying(true); setMediaSessionState(true); },
      pause: () => { audioRef.current?.pause(); setIsPlaying(false); setMediaSessionState(false); },
      prev: () => skipStationRef.current?.(-1),
      next: () => skipStationRef.current?.(1),
    });
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => {
    if (!currentStation) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      setMediaSessionState(false);
    } else {
      if (audioRef.current?.paused && audioRef.current.src) {
        audioRef.current.play()
          .then(() => { setIsPlaying(true); setMediaSessionState(true); })
          .catch(() => playStation(currentStation));
      } else playStation(currentStation);
    }
  }, [currentStation, isPlaying, playStation]);

  const skipStation = useCallback((dir) => {
    const list = filteredStations.length > 0 ? filteredStations : allStations;
    if (!list.length) return;
    if (!currentStation) { playStation(list[0]); return; }
    const idx = list.findIndex((s) => s.stationuuid === currentStation.stationuuid);
    playStation(list[(idx + dir + list.length) % list.length]);
  }, [filteredStations, allStations, currentStation, playStation]);

  // Keep skipStation ref current for Media Session handlers
  useEffect(() => { skipStationRef.current = skipStation; }, [skipStation]);

  // Volume — slider always shows real volume, mute just silences audio
  const changeVolume = (val) => {
    const v = parseFloat(val);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : v;
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    audioRef.current.volume = next ? 0 : volume;
  };

  const fmtTime = (d) => d.toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = (d) => d.toLocaleDateString("bn-BD", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="app-logo-svg">
            <RadioIcon size={36} color="#e31837" />
          </div>
          <div>
            <h1 className="app-title">বাংলা রেডিও</h1>
            <p className="app-subtitle">Bangladesh Online Radio</p>
          </div>
        </div>
        <div className="header-right">
          <div className="clock">
            <div className="clock-time">{fmtTime(currentTime)}</div>
            <div className="clock-date">{fmtDate(currentTime)}</div>
          </div>
        </div>
      </header>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="search-box">
            <span className="search-icon"><SearchIcon size={16} color="#64748b" /></span>
            <input
              type="text"
              placeholder="রেডিও খুঁজুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery("")}>
                <CloseIcon size={13} color="#94a3b8" />
              </button>
            )}
          </div>

          <div className="categories">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`cat-btn ${selectedCategory === cat ? "active" : ""}`}
                onClick={() => setSelectedCategory(cat)}
              >{cat}</button>
            ))}
          </div>

          <div className="station-count">
            {isFetching ? (
              <span className="status-fetching">
                <WifiIcon size={14} color="#60a5fa" /> লোড হচ্ছে...
              </span>
            ) : fetchError ? (
              <span className="fetch-error">ইন্টারনেট সংযোগ পরীক্ষা করুন</span>
            ) : (
              <span><LiveDotIcon size={9} color="#22c55e" /> {filteredStations.length} টি FM রেডিও</span>
            )}
          </div>

          <div className="station-list">
            {isFetching ? (
              <div className="loading-placeholder">
                {[...Array(8)].map((_, i) => <div key={i} className="skeleton-card" />)}
              </div>
            ) : filteredStations.length === 0 ? (
              <div className="empty-msg">কোনো স্টেশন পাওয়া যায়নি</div>
            ) : (
              filteredStations.map((station) => (
                <div
                  key={station.stationuuid}
                  className={`station-card ${currentStation?.stationuuid === station.stationuuid ? "active" : ""}`}
                  onClick={() => playStation(station)}
                  style={{ "--station-color": station.color }}
                >
                  <div className="station-icon-wrap">
                    <StationLogo station={station} size={42} />
                  </div>
                  <div className="station-info">
                    <div className="station-name">{station.name}</div>
                    <div className="station-freq">{station.frequency}</div>
                    <div className="station-meta">
                      {station.bitrate > 0 && <span className="bitrate-badge">{station.bitrate}kbps</span>}
                      {station.codec && station.codec !== "UNKNOWN" && <span className="codec-badge">{station.codec}</span>}
                    </div>
                  </div>
                  <div className="station-right-col">
                    <div className="station-category-badge">{station.category}</div>
                    {currentStation?.stationuuid === station.stationuuid && isPlaying && (
                      <div className="playing-bars"><span /><span /><span /><span /></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Player */}
        <main className="player-area">
          {currentStation ? (
            <div className="now-playing">
              <div
                className="player-hero"
                style={{ background: `linear-gradient(135deg, ${currentStation.color}cc, ${currentStation.color}33)` }}
              >
                <div className="player-logo-wrap">
                  <StationLogo station={currentStation} size={88} />
                </div>
                <div className="player-hero-info">
                  <h2 className="player-name">{currentStation.name}</h2>
                  <p className="player-freq">{currentStation.frequency}</p>
                  {currentStation.tags && (
                    <p className="player-desc">
                      {currentStation.tags.split(",").slice(0, 3).join(" • ")}
                    </p>
                  )}
                  <div className="player-badges">
                    <span className="player-cat-badge">{currentStation.category}</span>
                    {currentStation.bitrate > 0 && <span className="quality-badge">{currentStation.bitrate}kbps</span>}
                    {currentStation.codec && currentStation.codec !== "UNKNOWN" && (
                      <span className="quality-badge">{currentStation.codec}</span>
                    )}
                  </div>
                </div>
                <div className={`vinyl ${isPlaying ? "spinning" : ""}`}>
                  <div className="vinyl-inner">
                    <StationLogo station={currentStation} size={52} />
                  </div>
                </div>
              </div>

              {error && (
                <div className="error-box">
                  <span>{error}</span>
                  <button onClick={() => playStation(currentStation)} className="retry-btn">আবার চেষ্টা</button>
                </div>
              )}

              {isLoading && !error && (
                <div className="loading-box">
                  <LoadingIcon size={24} color="#60a5fa" />
                  <span>সংযোগ করা হচ্ছে...</span>
                </div>
              )}

              <div className="player-controls">
                <button className="ctrl-btn" onClick={() => skipStation(-1)} title="আগের স্টেশন">
                  <SkipPrevIcon size={24} />
                </button>
                <button
                  className={`play-btn ${isLoading ? "loading" : ""}`}
                  onClick={togglePlay}
                  style={{ background: currentStation.color }}
                >
                  {isLoading
                    ? <LoadingIcon size={28} color="#fff" />
                    : isPlaying
                      ? <PauseIcon size={28} color="#fff" />
                      : <PlayIcon size={28} color="#fff" />}
                </button>
                <button className="ctrl-btn" onClick={() => skipStation(1)} title="পরের স্টেশন">
                  <SkipNextIcon size={24} />
                </button>
              </div>

              {/* Volume — slider always shows real volume, mute just silences */}
              <div className="volume-section">
                <button className="mute-btn" onClick={toggleMute} title={isMuted ? "আনমিউট" : "মিউট"}>
                  {isMuted
                    ? <MuteIcon size={20} color="#ef4444" />
                    : volume > 0.5
                      ? <VolumeHighIcon size={20} color="#94a3b8" />
                      : <VolumeLowIcon size={20} color="#94a3b8" />}
                </button>
                <div className="volume-track-wrap">
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={volume}
                    onChange={(e) => changeVolume(e.target.value)}
                    className="volume-slider"
                    style={{
                      "--vol-color": isMuted ? "#ef4444" : currentStation.color,
                      "--vol-pct": `${Math.round(volume * 100)}%`,
                    }}
                  />
                </div>
                <span className="vol-pct" style={{ color: isMuted ? "#ef4444" : undefined }}>
                  {isMuted ? "🔇" : `${Math.round(volume * 100)}%`}
                </span>
              </div>

              <div className="status-bar">
                <LiveDotIcon
                  size={10}
                  color={isPlaying ? "#22c55e" : isLoading ? "#facc15" : "#4b5563"}
                />
                <span>
                  {isPlaying ? "সরাসরি সম্প্রচার চলছে"
                    : isLoading ? "সংযোগ করা হচ্ছে..."
                    : "বিরতি"}
                </span>
              </div>

              <div className="stream-info">
                <WifiIcon size={12} color="#475569" />
                <span>Radio Browser API — verified & always updated streams</span>
              </div>
            </div>
          ) : (
            <div className="welcome-screen">
              <div className="welcome-icon">
                <RadioIcon size={72} color="#e31837" />
              </div>
              <h2>বাংলা রেডিও তে স্বাগতম!</h2>
              {isFetching ? (
                <div className="loading-box" style={{ flexDirection: "column", gap: 12 }}>
                  <LoadingIcon size={32} color="#60a5fa" />
                  <p>FM স্টেশন লোড হচ্ছে...</p>
                </div>
              ) : (
                <>
                  <p>বাংলাদেশের সেরা FM রেডিও শুনুন</p>
                  <p className="welcome-sub">ইন্টারনেটের মাধ্যমে — Headphone ছাড়াই!</p>
                  <div className="welcome-features">
                    <div className="feature"><LiveDotIcon size={9} color="#22c55e" />{allStations.length}+ FM স্টেশন</div>
                    <div className="feature"><WifiIcon size={13} color="#60a5fa" />Verified Streams</div>
                    <div className="feature"><RadioIcon size={14} color="#f59e0b" />লাইভ স্ট্রিমিং</div>
                    <div className="feature"><VolumeHighIcon size={14} color="#a78bfa" />Headphone মুক্ত</div>
                  </div>
                  {allStations.length > 0 && (
                    <button className="start-btn" onClick={() => playStation(allStations[0])}>
                      <PlayIcon size={18} color="#fff" /> শুরু করুন
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
