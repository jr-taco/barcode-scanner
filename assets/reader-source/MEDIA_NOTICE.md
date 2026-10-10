# Native video conversion

`media.js` uses FFmpeg-compatible integer YUV-to-RGB table arithmetic, derived from FFmpeg `libswscale/yuv2rgb.c`, under LGPL-2.1-or-later. Source: https://github.com/FFmpeg/FFmpeg/blob/n8.0/libswscale/yuv2rgb.c . Copyright: Konstantin Shishkov (2009), Michael Niedermayer and the FFmpeg contributors. License: https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html .

Native NV12/I420 planes are read with declared offsets/strides and limited-range matrix. This preserves the frozen Python conversion convention, without calibration from hidden messages. Unsupported native formats retain an explicitly recorded browser-canvas fallback.
