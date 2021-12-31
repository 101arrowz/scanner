#![no_std]
#[macro_use]
extern crate alloc;

use wasm_bindgen::prelude::*;
use alloc::vec::Vec;

#[cfg(not(target_arch = "wasm32"))]
compile_error!("Only compilable to WASM");

mod image;
use image::{Image, RGBAImage};

struct Point { 
    x: f32,
    y: f32
}

struct Rect { 
    a: Point,
    b: Point,
    c: Point,
    d: Point
}

impl Into<Vec<f32>> for Rect {
    fn into(self) -> Vec<f32> {
        vec![self.a.x, self.a.y, self.b.x, self.b.y, self.c.x, self.c.y, self.d.x, self.d.y]
    }
}

#[wasm_bindgen]
pub fn document(data: Vec<u8>, width: usize, height: usize, by: f32) -> Vec<f32> {
    (RGBAImage { data, width, height }).to_grayscale().downscale(by).data
}