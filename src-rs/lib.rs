#![no_std]
#![feature(int_abs_diff)]
#[macro_use]
extern crate alloc;
extern crate wee_alloc;

use wasm_bindgen::{prelude::*, Clamped};
use web_sys::ImageData;
use console_error_panic_hook;

mod image;
use image::{Quad, RGBAImage};

#[cfg(not(target_arch = "wasm32"))]
compile_error!("Only compilable to WASM");

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

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

impl From<ImageData> for RGBAImage {
    fn from(data: ImageData) -> Self {
        let width = data.width() as usize;
        let height = data.height() as usize;
        let data = data.data().0;
        RGBAImage {
            data,
            width,
            height,
        }
    }
}

// #[wasm_bindgen]
// pub fn find_edges(data: ImageData, threshold: f32) -> Array {
//     console_error_panic_hook::set_once();
//     let rgba: RGBAImage = data.into();
//     let mut by = (rgba.width.min(rgba.height) as f32) / 360.0;
//     if by < 2.0 {
//         by = 1.0
//     }
//     let mut src = rgba.to_grayscale();
//     if by != 1.0 {
//         src = src.downscale(by);
//     }
//     src.gaussian().edges(threshold).into_iter().map(JsValue::from).collect()
// }

#[wasm_bindgen]
pub fn find_document(data: ImageData, tries: Option<usize>) -> Option<Quad> {
    console_error_panic_hook::set_once();
    let rgba: RGBAImage = data.into();
    let mut by = (rgba.width.min(rgba.height) as f32) / 360.0;
    if by < 2.0 {
        by = 1.0
    }
    let mut src = rgba.to_grayscale();
    if by != 1.0 {
        src = src.downscale(by);
    }
    let quads = src.gaussian().quads(tries.unwrap_or(3));
    quads.get(0).map(|doc| {
        let mut doc = sort_quad(doc.quad);
        doc.a.x *= by;
        doc.a.y *= by;
        doc.b.x *= by;
        doc.b.y *= by;
        doc.c.x *= by;
        doc.c.y *= by;
        doc.d.x *= by;
        doc.d.y *= by;
        doc
    })
}

#[wasm_bindgen]
pub fn extract_document(
    data: ImageData,
    region: Quad,
    target_width: usize,
    target_height: Option<usize>,
) -> ImageData {
    let rgba: RGBAImage = data.into();
    let target_height = if let Some(height) = target_height {
        height
    } else {
        let (side, top) = sum_sides(region);
        (side / top * (target_width as f32)) as usize
    };
    ImageData::new_with_u8_clamped_array_and_sh(
        Clamped(&rgba.perspective(region, target_width, target_height).data),
        target_width as u32,
        target_height as u32,
    )
    .unwrap()
}
