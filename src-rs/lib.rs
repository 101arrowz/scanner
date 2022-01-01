#![no_std]
#![feature(int_abs_diff)]
#[macro_use]
extern crate alloc;

use wasm_bindgen::{prelude::*, Clamped};
use web_sys::ImageData;

#[cfg(not(target_arch = "wasm32"))]
compile_error!("Only compilable to WASM");

mod image;
use image::{Quad, RGBAImage};

fn sum_sides(quad: Quad) -> (f32, f32) {
    let Quad { a, b, c, d } = quad;
    let side = (a.x - b.x).hypot(a.y - b.y) + (c.x - d.x).hypot(c.y - d.y);
    let top = (b.x - c.x).hypot(b.y - c.y) + (d.x - a.x).hypot(d.y - a.y);
    (side, top)
}

fn sort_quad(quad: Quad) -> Quad {
    let Quad { a, b, c, d } = quad;
    let (side, top) = sum_sides(quad);
    if side > top {
        if a.x + b.x < c.x + d.x {
            if a.y > b.y {
                Quad { a, b, c, d }
            } else {
                Quad {
                    a: b,
                    b: a,
                    c: d,
                    d: c,
                }
            }
        } else {
            if c.y > d.y {
                Quad {
                    a: c,
                    b: d,
                    c: a,
                    d: b,
                }
            } else {
                Quad {
                    a: d,
                    b: c,
                    c: b,
                    d: a,
                }
            }
        }
    } else {
        if b.x + c.x < d.x + a.x {
            if b.y > c.y {
                Quad {
                    a: b,
                    b: c,
                    c: d,
                    d: a,
                }
            } else {
                Quad { a: c, b, c: a, d }
            }
        } else {
            if d.y > a.y {
                Quad {
                    a: d,
                    b: a,
                    c: b,
                    d: c,
                }
            } else {
                Quad { a, b: d, c, d: b }
            }
        }
    }
}

#[wasm_bindgen]
pub fn extract_document(
    data: ImageData,
    target_width: usize,
    target_height: Option<usize>,
) -> ImageData {
    let width = data.width() as usize;
    let height = data.height() as usize;
    let data = data.data().0;
    let rgba = RGBAImage {
        data,
        width,
        height,
    };
    let mut by = (width.min(height) as f32) / 360.0;
    if by < 2.0 {
        by = 1.0
    }
    let mut src = rgba.to_grayscale();
    if by != 1.0 {
        src = src.downscale(by);
    }
    let mut doc = sort_quad(src.gaussian().quads()[0].quad);
    doc.a.x *= by;
    doc.a.y *= by;
    doc.b.x *= by;
    doc.b.y *= by;
    doc.c.x *= by;
    doc.c.y *= by;
    doc.d.x *= by;
    doc.d.y *= by;
    let target_height = if let Some(height) = target_height {
        height
    } else {
        let (side, top) = sum_sides(doc);
        (side / top * (target_width as f32)) as usize
    };
    ImageData::new_with_u8_clamped_array_and_sh(
        Clamped(&rgba.perspective(doc, target_width, target_height).data),
        target_width as u32,
        target_height as u32,
    )
    .unwrap()
}
