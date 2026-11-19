import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

interface QrCodeImageProps {
  value: string;
  size?: number;
  className?: string;
}

export const QrCodeImage: React.FC<QrCodeImageProps> = ({ value, size = 180, className = '' }) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 2,
      color: {
        dark: '#064E3B',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-2xl bg-emerald-50 dark:bg-slate-800 animate-pulse ${className}`}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="رمز QR للمنيو"
      width={size}
      height={size}
      className={`rounded-2xl bg-white p-2 border border-emerald-100 ${className}`}
    />
  );
};

export async function downloadQrPng(value: string, filename = 'ghazalo-menu-qr.png'): Promise<void> {
  const url = await QRCode.toDataURL(value, {
    width: 1024,
    margin: 3,
    color: { dark: '#064E3B', light: '#FFFFFF' },
  });
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadQrSvg(value: string, filename = 'ghazalo-menu-qr.svg'): Promise<void> {
  const svgStr = await QRCode.toString(value, {
    type: 'svg',
    margin: 2,
    color: { dark: '#064E3B', light: '#FFFFFF' },
  });
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadQrPdf(
  value: string,
  title = 'Ghazalo Digital Menu QR',
  filename = 'ghazalo-menu-qr.pdf'
): Promise<void> {
  const dataUrl = await QRCode.toDataURL(value, {
    width: 1024,
    margin: 2,
    color: { dark: '#064E3B', light: '#FFFFFF' },
  });
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFillColor(240, 253, 244);
  doc.rect(0, 0, 210, 297, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(25, 35, 160, 215, 10, 10, 'F');
  doc.setTextColor(6, 78, 59);
  doc.setFontSize(22);
  doc.text('Ghazalo - Digital Menu', 105, 60, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(71, 85, 105);
  doc.text(title.slice(0, 48), 105, 72, { align: 'center' });
  doc.addImage(dataUrl, 'PNG', 50, 86, 110, 110);
  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74);
  doc.text('Scan QR code to view menu & order', 105, 212, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(value.slice(0, 80), 105, 224, { align: 'center' });
  doc.save(filename);
}
