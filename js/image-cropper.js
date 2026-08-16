// Interactive Image Cropper Engine for Apex Velocity
// Handles smooth pan, zoom, rotation, guidelines, and high-res export for Racer Photos & Team Logos

export class ImageCropper {
  constructor() {
    this.modalEl = null;
    this.canvas = null;
    this.ctx = null;
    this.previewCanvas = null;
    this.previewCtx = null;

    this.image = typeof Image !== 'undefined' ? new Image() : null;
    this.imageLoaded = false;
    this.onSaveCallback = null;

    // Transform State
    this.scale = 1;
    this.minScale = 0.2;
    this.maxScale = 4;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0; // degrees: 0, 90, 180, 270

    // Drag State
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.initialOffsetX = 0;
    this.initialOffsetY = 0;

    // Viewport Size
    this.viewportWidth = 380;
    this.viewportHeight = 320;
    this.cropSize = 220; // 220x220 square/circle crop box

    this.shape = 'square'; // 'square' or 'circle'
    this.title = '✂️ Adjust & Crop Photo';

    if (typeof document !== 'undefined') {
      this.initDOM();
    }
  }

  initDOM() {
    if (typeof document === 'undefined') return;

    let existing = document.getElementById('image-cropper-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'image-cropper-modal';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 480px; width: 92%; padding: 1.5rem; background: var(--bg-card); border: 1px solid var(--border-cyan);">
        <div class="modal-header" style="margin-bottom: 0.75rem;">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="font-size:1.3rem;">✂️</span>
            <div>
              <h3 id="cropper-modal-title" style="font-family: var(--font-display); font-size: 1.15rem; color: #fff; margin: 0;">
                Crop & Frame Image
              </h3>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">
                Drag to reposition • Scroll or slider to zoom
              </div>
            </div>
          </div>
          <button type="button" class="modal-close-btn" onclick="window.imageCropper.close()">✕</button>
        </div>

        <!-- Canvas Crop Viewport -->
        <div style="display:flex; justify-content:center; align-items:center; position:relative; background:#070a10; border-radius:var(--radius-md); border:1px solid var(--border-subtle); overflow:hidden; margin-bottom:1rem; user-select:none; touch-action:none;">
          <canvas id="cropper-viewport-canvas" width="${this.viewportWidth}" height="${this.viewportHeight}" style="display:block; cursor:grab; max-width:100%; height:auto;"></canvas>
          <div style="position:absolute; top:8px; left:10px; font-size:0.7rem; color:rgba(255,255,255,0.7); background:rgba(0,0,0,0.6); padding:2px 8px; border-radius:10px; pointer-events:none;">
            🎯 Frame Inside Highlight
          </div>
        </div>

        <!-- Controls: Zoom Slider & Rotate & Fit -->
        <div style="display:flex; flex-direction:column; gap:0.75rem; margin-bottom:1rem;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="font-size:0.8rem; color:var(--text-muted);">🔍 Zoom:</span>
            <input type="range" id="cropper-zoom-slider" min="0.5" max="3" step="0.02" value="1" class="telemetry-slider" style="flex:1;">
            <span id="cropper-zoom-val" style="font-family:var(--font-mono); font-size:0.78rem; color:var(--accent-cyan); width:42px; text-align:right;">100%</span>
          </div>

          <div style="display:flex; gap:0.5rem; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:0.4rem;">
              <button type="button" class="btn btn-outline btn-sm" onclick="window.imageCropper.rotate(90)" title="Rotate 90 degrees">
                🔄 Rotate
              </button>
              <button type="button" class="btn btn-outline btn-sm" onclick="window.imageCropper.fitCenter()" title="Fit & Center Image">
                🎯 Reset & Fit
              </button>
            </div>

            <!-- Live Previews -->
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span style="font-size:0.72rem; color:var(--text-muted);">Preview:</span>
              <div id="cropper-preview-round" style="width:38px; height:38px; border-radius:var(--radius-sm); border:2px solid var(--accent-cyan); overflow:hidden; background:#111;">
                <canvas id="cropper-preview-canvas" width="38" height="38" style="width:100%; height:100%; display:block;"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex; justify-content:flex-end; gap:0.75rem; border-top:1px solid var(--border-subtle); padding-top:1rem;">
          <button type="button" class="btn btn-outline" onclick="window.imageCropper.close()">Cancel</button>
          <button type="button" class="btn btn-cyan" onclick="window.imageCropper.applyCrop()">
            ✂️ Apply Crop & Save
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    this.modalEl = modal;
    this.canvas = document.getElementById('cropper-viewport-canvas');
    if (this.canvas) this.ctx = this.canvas.getContext('2d');
    this.previewCanvas = document.getElementById('cropper-preview-canvas');
    if (this.previewCanvas) this.previewCtx = this.previewCanvas.getContext('2d');

    this.bindEvents();
  }

  bindEvents() {
    if (!this.canvas) return;

    // Mouse Events
    this.canvas.addEventListener('mousedown', (e) => this.onDragStart(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) this.onDragMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => this.onDragEnd());

    // Touch Events
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.onDragStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length === 1) {
        this.onDragMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => this.onDragEnd());

    // Mouse Wheel Zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      this.setZoom(this.scale * zoomFactor);
    }, { passive: false });

    // Slider Zoom
    const slider = document.getElementById('cropper-zoom-slider');
    if (slider) {
      slider.addEventListener('input', (e) => {
        this.setZoom(parseFloat(e.target.value));
      });
    }
  }

  open({ imageSrc, title = '✂️ Adjust & Crop Photo', shape = 'square', onSave }) {
    if (!this.modalEl) this.initDOM();
    this.title = title;
    this.shape = shape;
    this.onSaveCallback = onSave;

    const titleEl = document.getElementById('cropper-modal-title');
    if (titleEl) titleEl.textContent = title;

    const previewContainer = document.getElementById('cropper-preview-round');
    if (previewContainer) {
      previewContainer.style.borderRadius = shape === 'circle' ? '50%' : 'var(--radius-sm)';
    }

    this.image = new Image();
    this.imageLoaded = false;
    this.rotation = 0;

    this.image.onload = () => {
      this.imageLoaded = true;
      this.fitCenter();
      this.draw();
    };
    this.image.src = imageSrc;

    if (this.modalEl) this.modalEl.classList.add('active');
  }

  close() {
    if (this.modalEl) this.modalEl.classList.remove('active');
    this.isDragging = false;
  }

  fitCenter() {
    if (!this.imageLoaded) return;

    const iw = this.image.width;
    const ih = this.image.height;
    const minDim = Math.min(iw, ih);

    this.scale = (this.cropSize / minDim) * 1.05;
    this.minScale = (this.cropSize / Math.max(iw, ih)) * 0.5;
    this.maxScale = this.scale * 4;

    const slider = document.getElementById('cropper-zoom-slider');
    if (slider) {
      slider.min = this.minScale.toFixed(2);
      slider.max = this.maxScale.toFixed(2);
      slider.value = this.scale.toFixed(2);
    }

    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation = 0;

    this.updateZoomDisplay();
    this.draw();
  }

  setZoom(val) {
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, val));
    const slider = document.getElementById('cropper-zoom-slider');
    if (slider) slider.value = this.scale.toFixed(2);
    this.updateZoomDisplay();
    this.draw();
  }

  updateZoomDisplay() {
    const valEl = document.getElementById('cropper-zoom-val');
    if (valEl) {
      valEl.textContent = Math.round((this.scale / (this.cropSize / Math.min(this.image.width || 1, this.image.height || 1))) * 100) + '%';
    }
  }

  rotate(deg = 90) {
    this.rotation = (this.rotation + deg) % 360;
    this.draw();
  }

  onDragStart(clientX, clientY) {
    if (!this.imageLoaded) return;
    this.isDragging = true;
    if (this.canvas) this.canvas.style.cursor = 'grabbing';
    this.dragStartX = clientX;
    this.dragStartY = clientY;
    this.initialOffsetX = this.offsetX;
    this.initialOffsetY = this.offsetY;
  }

  onDragMove(clientX, clientY) {
    if (!this.isDragging) return;
    const dx = clientX - this.dragStartX;
    const dy = clientY - this.dragStartY;
    this.offsetX = this.initialOffsetX + dx;
    this.offsetY = this.initialOffsetY + dy;
    this.draw();
  }

  onDragEnd() {
    if (this.isDragging) {
      this.isDragging = false;
      if (this.canvas) this.canvas.style.cursor = 'grab';
    }
  }

  draw() {
    if (!this.ctx || !this.imageLoaded) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const halfCrop = this.cropSize / 2;

    // Clear background
    this.ctx.fillStyle = '#080c14';
    this.ctx.fillRect(0, 0, w, h);

    // Save context for image transform
    this.ctx.save();
    this.ctx.translate(cx + this.offsetX, cy + this.offsetY);
    this.ctx.rotate((this.rotation * Math.PI) / 180);
    this.ctx.scale(this.scale, this.scale);
    this.ctx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    this.ctx.restore();

    // Draw Darkened Mask with Highlight Cut-out
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(5, 8, 14, 0.72)';

    this.ctx.beginPath();
    this.ctx.rect(0, 0, w, h);

    if (this.shape === 'circle') {
      this.ctx.arc(cx, cy, halfCrop, 0, Math.PI * 2, true);
    } else {
      this.drawRoundedRectPath(this.ctx, cx - halfCrop, cy - halfCrop, this.cropSize, this.cropSize, 14, true);
    }
    this.ctx.fill();

    // Draw Crop Frame Border & Glow
    this.ctx.strokeStyle = '#00f2fe';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = 'rgba(0,242,254,0.6)';
    this.ctx.shadowBlur = 8;

    if (this.shape === 'circle') {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, halfCrop, 0, Math.PI * 2);
      this.ctx.stroke();
    } else {
      this.ctx.beginPath();
      this.drawRoundedRectPath(this.ctx, cx - halfCrop, cy - halfCrop, this.cropSize, this.cropSize, 14);
      this.ctx.stroke();
    }

    // Draw Rule of Thirds Guidelines
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
    this.ctx.lineWidth = 1;

    const third = this.cropSize / 3;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - halfCrop + third, cy - halfCrop);
    this.ctx.lineTo(cx - halfCrop + third, cy + halfCrop);
    this.ctx.moveTo(cx - halfCrop + third * 2, cy - halfCrop);
    this.ctx.lineTo(cx - halfCrop + third * 2, cy + halfCrop);
    this.ctx.moveTo(cx - halfCrop, cy - halfCrop + third);
    this.ctx.lineTo(cx + halfCrop, cy - halfCrop + third);
    this.ctx.moveTo(cx - halfCrop, cy - halfCrop + third * 2);
    this.ctx.lineTo(cx + halfCrop, cy - halfCrop + third * 2);
    this.ctx.stroke();

    this.ctx.restore();

    this.updateLivePreview();
  }

  drawRoundedRectPath(ctx, x, y, width, height, radius, counterClockwise = false) {
    ctx.moveTo(x + radius, y);
    if (!counterClockwise) {
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    } else {
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y + height, x + radius, y + height);
      ctx.lineTo(x + width - radius, y + height);
      ctx.quadraticCurveTo(x + width, y + height, x + width, y + height - radius);
      ctx.lineTo(x + width, y + radius);
      ctx.quadraticCurveTo(x + width, y, x + width - radius, y);
      ctx.lineTo(x + radius, y);
    }
  }

  updateLivePreview() {
    if (!this.previewCtx || !this.imageLoaded) return;

    const pw = this.previewCanvas.width;
    const ph = this.previewCanvas.height;
    this.previewCtx.clearRect(0, 0, pw, ph);

    const halfCrop = this.cropSize / 2;
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    this.previewCtx.drawImage(
      this.canvas,
      cx - halfCrop,
      cy - halfCrop,
      this.cropSize,
      this.cropSize,
      0,
      0,
      pw,
      ph
    );
  }

  getCroppedDataURL(outputSize = 240) {
    if (!this.imageLoaded) return null;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const outCtx = outCanvas.getContext('2d');

    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    const ratio = outputSize / this.cropSize;

    outCtx.save();
    outCtx.translate(outputSize / 2, outputSize / 2);
    outCtx.rotate((this.rotation * Math.PI) / 180);
    outCtx.scale(this.scale * ratio, this.scale * ratio);
    outCtx.translate(this.offsetX / this.scale, this.offsetY / this.scale);
    outCtx.drawImage(this.image, -this.image.width / 2, -this.image.height / 2);
    outCtx.restore();

    return outCanvas.toDataURL('image/jpeg', 0.82);
  }

  applyCrop() {
    const croppedData = this.getCroppedDataURL(240);
    if (croppedData && this.onSaveCallback) {
      this.onSaveCallback(croppedData);
    }
    this.close();
  }
}

export const imageCropper = new ImageCropper();
if (typeof window !== 'undefined') {
  window.imageCropper = imageCropper;
}
