import { downloadBlob, downloadText, svgToDataUrl, } from '../utils/helpers.js';
import { validateElement } from '../core/State.js';

const DEFAULT_SCALE = 2;
const DEFAULT_QUALITY = 0.9;
const MAX_EXPORT_DIMENSION = 16384;
const MAX_EXPORT_PIXELS = 100_000_000;
export class ExportManager {
  constructor(editor) {
    if ( !editor?.state || !editor?.renderer || !editor?.commands ) {
      throw new TypeError( 'ExportManager requires a valid editor instance.' );
    }
    this.editor = editor;
    this.exporting = false;
  }

  exportSVG() {
    try {
      const svg = this._getSVG();
      downloadText( svg, 'export.svg', 'image/svg+xml' );
      this._setStatus('SVG exported successfully');
      return true;
    } catch (error) {
      this._handleError('SVG export failed', error);
      return false;
    }
  }

  exportPNG(scale = DEFAULT_SCALE) {
    return this._rasterExport( 'png', scale, DEFAULT_QUALITY );
  }

  exportJPEG( scale = DEFAULT_SCALE, quality = DEFAULT_QUALITY ) {
    return this._rasterExport( 'jpeg', scale, quality );
  }

  async _rasterExport(format, scale, quality) {
    if (this.exporting) {
      this._setStatus( 'An export is already in progress' );
      return false;
    }

    if (!['png', 'jpeg'].includes(format)) {
      this._setStatus('Unsupported export format');
      return false;
    }

    const dimensions = this._getExportDimensions(scale);
    if (!dimensions) {
      return false;
    }

    if ( typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 1 ) {
      this._setStatus( 'Image quality must be between 0 and 1' );
      return false;
    }

    if ( typeof document === 'undefined' || typeof Image === 'undefined' ) {
      this._setStatus( 'Image export is not available in this environment' );
      return false;
    }

    this.exporting = true;
    this._setStatus( `Preparing ${format.toUpperCase()} export...` );
    try {
      const svg = this._getSVG();
      const image = await this._loadImage(svg);
      const canvas = document.createElement('canvas');
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error( 'Could not create a canvas rendering context' );
      }

      if (format === 'jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect( 0, 0, canvas.width, canvas.height );
      }

      context.drawImage( image, 0, 0, canvas.width, canvas.height );
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const extension = format === 'jpeg' ? 'jpg' : 'png';
      const blob = await this._canvasToBlob( canvas, mimeType, format === 'jpeg' ? quality : undefined );
      downloadBlob(blob, `export.${extension}`);
      this._setStatus( `${format.toUpperCase()} exported successfully` );
      return true;
    } catch (error) {
      this._handleError( `${format.toUpperCase()} export failed`, error );
      return false;
    } finally {
      this.exporting = false;
    }
  }

  _getExportDimensions(scale) {
    const { width, height } = this.editor.state.data;
    if ( !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ) {
      this._setStatus('Invalid project dimensions');
      return null;
    }

    if ( typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0 ) {
      this._setStatus( 'Export scale must be a positive number' );
      return null;
    }

    const exportWidth = Math.round(width * scale);
    const exportHeight = Math.round(height * scale);
    if (
      !Number.isSafeInteger(exportWidth) ||
      !Number.isSafeInteger(exportHeight) ||
      exportWidth <= 0 ||
      exportHeight <= 0 ||
      exportWidth > MAX_EXPORT_DIMENSION ||
      exportHeight > MAX_EXPORT_DIMENSION ||
      exportWidth * exportHeight > MAX_EXPORT_PIXELS
    ) {
      this._setStatus( 'Export dimensions are too large. Try a smaller export scale.' );
      return null;
    }

    return {
      width: exportWidth,
      height: exportHeight,
    };
  }

  _getSVG() {
    const svg = this.editor.renderer.exportSVG();
    if ( typeof svg !== 'string' || !svg.trim() ) {
      throw new Error( 'The renderer did not produce a valid SVG document' );
    }

    if (!/<svg(?:\s|>)/i.test(svg)) {
      throw new Error( 'The exported document is not an SVG' );
    }
    return svg;
  }

  _loadImage(svg) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if ( image.naturalWidth === 0 || image.naturalHeight === 0 ) {
          reject( new Error( 'The exported SVG could not be rendered' ) );
          return;
        }
        resolve(image);
      };

      image.onerror = () => {
        reject( new Error( 'The SVG image could not be loaded' ) );
      };

      try {
        image.src = svgToDataUrl(svg);
      } catch (error) {
        reject(error);
      }
    });
  }

  _canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      try {
        const callback = (blob) => {
          if (!blob) {
            reject( new Error( 'The browser could not create the export file' ) );
            return;
          }
          resolve(blob);
        };

        if (quality === undefined) {
          canvas.toBlob(callback, mimeType);
        } else {
          canvas.toBlob( callback, mimeType, quality );
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  exportJSON() {
    try {
      const data = this.editor.state.data;
      const json = JSON.stringify(data, null, 2);
      if (typeof json !== 'string') {
        throw new Error( 'The project could not be serialized' );
      }
      downloadText( json, 'project.json', 'application/json' );
      this._setStatus( 'Project exported successfully' );
      return true;
    } catch (error) {
      this._handleError( 'Project export failed', error );
      return false;
    }
  }

  importJSON(jsonStr) {
    try {
      if ( typeof jsonStr !== 'string' || !jsonStr.trim() ) {
        throw new Error( 'Please provide a valid project file' );
      }

      const data = JSON.parse(jsonStr);
      this._validateProject(data);
      const normalizedData = {
        ...data,
        elements: data.elements.map( (element) => validateElement(element) ),
      };

      if ( normalizedData.elements.some( (element) => !element ) ) {
        throw new Error( 'The project contains invalid elements' );
      }

      this.editor.state.load(normalizedData);
      this.editor.commands.clear();
      this.editor.selection.clear();
      this.editor.fitToScreen();
      this._setStatus( 'Project loaded successfully' );
      return true;
    } catch (error) {
      this._handleError( 'Project load failed', error );
      return false;
    }
  }

  _validateProject(data) {
    if ( !data || typeof data !== 'object' || Array.isArray(data) ) {
      throw new Error( 'The project file must contain a JSON object' );
    }

    if (!Array.isArray(data.elements)) {
      throw new Error( 'The project is missing its elements array' );
    }

    if ( !Number.isFinite(data.width) || !Number.isFinite(data.height) || data.width <= 0 || data.height <= 0 ) {
      throw new Error( 'The project has invalid canvas dimensions' );
    }

    for (const element of data.elements) {
      if ( !element || typeof element !== 'object' || Array.isArray(element) ) {
        throw new Error( 'The project contains an invalid element' );
      }
    }
  }

  _setStatus(message) {
    this.editor.setStatus?.(message);
  }

  _handleError(message, error) {
    const detail = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    this._setStatus( `${message}: ${detail}` );
    console.error( `[ExportManager] ${message}`, error );
  }
}