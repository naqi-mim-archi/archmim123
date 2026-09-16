import { CanvasLayer, TextBoxState, TextProperties } from '../types/canvas';

export class TextEngine {
  private static transformedText(text: string, transform: TextProperties['textTransform']) {
    if (transform === 'uppercase') return text.toUpperCase();
    if (transform === 'lowercase') return text.toLowerCase();
    if (transform === 'capitalize') return text.replace(/\b\w/g, character => character.toUpperCase());
    return text;
  }

  private static wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
    const output: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (!paragraph) { output.push(''); continue; }
      const words = paragraph.split(/\s+/);
      let line = words.shift() || '';
      for (const word of words) {
        const candidate = `${line} ${word}`;
        if (ctx.measureText(candidate).width <= width || !line) line = candidate;
        else { output.push(line); line = word; }
      }
      output.push(line);
    }
    return output;
  }

  static render(layer: CanvasLayer, props: TextProperties, box: TextBoxState): void {
    const ctx = layer.ctx;
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.save();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(box.rotation * Math.PI / 180);
    ctx.transform(1, Math.tan(box.skewY * Math.PI / 180), Math.tan(box.skewX * Math.PI / 180), 1, 0, 0);
    ctx.translate(-box.width / 2, -box.height / 2);
    ctx.beginPath();
    ctx.rect(0, 0, box.width, box.height);
    ctx.clip();

    ctx.fillStyle = props.color;
    ctx.strokeStyle = props.color;
    ctx.globalAlpha = (props.opacity ?? 100) / 100;
    ctx.font = `${props.fontStyle === 'italic' ? 'italic ' : ''}${props.fontWeight} ${props.fontSize}px "${props.fontFamily}", sans-serif`;
    ctx.textAlign = props.align === 'justify' ? 'left' : props.align;
    ctx.textBaseline = 'top';
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${props.letterSpacing}px`;

    const text = this.transformedText(props.text, props.textTransform);
    const lines = this.wrapLines(ctx, text, box.width);
    const lineHeight = props.fontSize * props.lineHeight;
    const drawX = props.align === 'center' ? box.width / 2 : props.align === 'right' ? box.width : 0;
    lines.forEach((line, index) => {
      const y = index * lineHeight;
      if (y + lineHeight > box.height) return;
      ctx.fillText(line, drawX, y);
      if (props.textDecoration === 'underline') {
        const measured = ctx.measureText(line).width;
        const startX = props.align === 'center' ? drawX - measured / 2 : props.align === 'right' ? drawX - measured : drawX;
        ctx.lineWidth = Math.max(1, props.fontSize / 15);
        ctx.beginPath();
        ctx.moveTo(startX, y + props.fontSize * 1.05);
        ctx.lineTo(startX + measured, y + props.fontSize * 1.05);
        ctx.stroke();
      }
    });
    ctx.restore();
    layer.type = 'text';
    layer.textProps = { ...props };
    layer.textBox = { ...box };
  }
}
