import type { ShareCardData } from '../lib/share';
import { shareCard } from '../lib/share';

interface ShareModalProps {
  data: ShareCardData;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function ShareModal({ data, onClose, onToast }: ShareModalProps) {
  const handleShare = async () => {
    const result = await shareCard(data);
    if (result === 'shared') {
      onToast('Shared! 💫');
    } else if (result === 'copied') {
      onToast('Copied to clipboard');
    } else {
      onToast('Sharing unavailable');
    }
    onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card glass-card" onClick={(e) => e.stopPropagation()}>
        <h2>{data.title}</h2>
        <div className="share-visual">
          {data.frameUrl ? (
            <img src={data.frameUrl} alt="future face" crossOrigin="anonymous" />
          ) : (
            <div className="tm-placeholder">GENERATED</div>
          )}
          <span className="tm-age-badge">{data.age}</span>
        </div>
        <p className="share-headline">{data.headline}</p>
        {data.lines.map((l, i) => (
          <p key={i} className="share-line">{l}</p>
        ))}
        <p className="share-foot muted">{data.footer}</p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={handleShare}>
            Share
          </button>
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
