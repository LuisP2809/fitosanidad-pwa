import qrcode from '../vendor/qrcode.mjs';

export function qrSvg(value) {
  const qr = qrcode(0, 'M');
  qr.addData(String(value || ''));
  qr.make();
  return qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
}
