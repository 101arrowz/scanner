#![no_std]
#![feature(int_abs_diff)]
#[macro_use]
extern crate alloc;
extern crate console_error_panic_hook;

use alloc::vec::Vec;
use wasm_bindgen::prelude::*;

#[cfg(not(target_arch = "wasm32"))]
compile_error!("Only compilable to WASM");

mod image;
use image::{Line, RGBAImage, ScoredQuad};

fn ser_quads(quads: Vec<ScoredQuad>) -> Vec<f32> {
    let mut out = Vec::new();
    for ScoredQuad { quad, score } in quads {
        out.push(quad.a.x);
        out.push(quad.a.y);
        out.push(quad.b.x);
        out.push(quad.b.y);
        out.push(quad.c.x);
        out.push(quad.c.y);
        out.push(quad.d.x);
        out.push(quad.d.y);
        out.push(score);
    }
    out
}

fn ser_edges(edges: Vec<Line>) -> Vec<f32> {
    let mut out = Vec::new();
    for Line { angle, bin, score } in edges {
        out.push(angle as f32);
        out.push(bin as f32);
        out.push(score);
    }
    out
}

#[wasm_bindgen]
pub fn document(data: Vec<u8>, width: usize, height: usize, by: f32) -> Vec<f32> {
    console_error_panic_hook::set_once();
    ser_quads(
        (RGBAImage {
            data,
            width,
            height,
        })
        .to_grayscale()
        .downscale(by)
        .gaussian()
        .quads(),
    )
}
