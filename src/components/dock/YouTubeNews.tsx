import { useState } from 'react';
import DockPanel from './DockPanel';

/** 24/7 live news channels; embeds load ONLY after an explicit click so no
 *  third-party request happens silently (see PrivacyPanel note). */
const CHANNELS: { name: string; channelId: string }[] = [
  { name: 'Sky News', channelId: 'UCoMdktPbSTixAyNGwb-UYkQ' },
  { name: 'Al Jazeera', channelId: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { name: 'DW News', channelId: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { name: 'France 24', channelId: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
  { name: 'ABC News', channelId: 'UCBi2mrWuNuyYy4gbM6fU18Q' },
];

export default function YouTubeNews() {
  const [active, setActive] = useState<string | null>(null);
  const chan = CHANNELS.find((c) => c.channelId === active);
  return (
    <DockPanel title="LIVE TV" source="YouTube">
      <div className="dock-tabs">
        {CHANNELS.map((c) => (
          <button key={c.channelId} className={`dock-tab ${active === c.channelId ? 'active' : ''}`} onClick={() => setActive(c.channelId)}>
            {c.name}
          </button>
        ))}
      </div>
      {chan ? (
        <iframe
          className="dock-video"
          src={`https://www.youtube-nocookie.com/embed/live_stream?channel=${chan.channelId}&autoplay=1&mute=1`}
          title={`${chan.name} live stream`}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="dock-placeholder">Click a channel to load — loads YouTube content (third-party).</div>
      )}
    </DockPanel>
  );
}
