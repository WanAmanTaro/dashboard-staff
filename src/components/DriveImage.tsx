import React, { useEffect, useState } from 'react';
import { fetchDriveFileBlob } from '../services/apiClient';

interface DriveImageProps {
  driveFileId?: string;
  fullName: string;
  className?: string;
}

export const DriveImage: React.FC<DriveImageProps> = ({
  driveFileId,
  fullName,
  className = 'w-12 h-12 rounded-lg',
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!driveFileId) {
      setBlobUrl(null);
      return;
    }

    fetchDriveFileBlob(driveFileId)
      .then((res) => {
        if (!active) {
          URL.revokeObjectURL(res.blobUrl);
          return;
        }
        objectUrl = res.blobUrl;
        setBlobUrl(res.blobUrl);
        setFailed(false);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setBlobUrl(null);
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [driveFileId]);

  const initials = (fullName || 'IAB')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  if (!blobUrl || failed) {
    return (
      <div
        className={`${className} bg-[#0B1F3B] text-[#F5D076] font-bold flex items-center justify-center shrink-0 border border-[#C69738]/40 select-none`}
        title={fullName}
      >
        <span className="text-xs tracking-wider">{initials || 'IAB'}</span>
      </div>
    );
  }

  return (
    <img
      src={blobUrl}
      alt={`Foto profil ${fullName}`}
      referrerPolicy="no-referrer"
      className={`${className} object-cover shrink-0 border border-slate-200 bg-slate-100`}
      onError={() => setFailed(true)}
    />
  );
};
