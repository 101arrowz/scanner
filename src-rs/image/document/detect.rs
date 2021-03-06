use core::cmp::Ordering;

use super::super::Image;
use super::{
    consts::{
        ANGS_PER_RAD, COS, GRADIENT_ERROR, GRADIENT_OFFSET, HOUGH_MATCH_RATIO, MAX_ANG_ERROR, SIN,
    },
    Point, Quad, ScoredQuad,
};
use alloc::vec::Vec;

pub struct GradientVotesResult {
    height: usize,
    width: usize,
    diag: f32,
    num_bins: usize,
    buf: Vec<f32>,
    grad_buf: Vec<f32>,
    avg_grad: f32,
    max_grad: f32,
}

pub fn gradient_votes(source: &Image) -> GradientVotesResult {
    let &Image {
        data: ref source,
        width,
        height,
    } = source;
    let hf = height as f32;
    let wf = width as f32;
    let diag = hf.hypot(wf);
    let num_bins = diag as usize;
    let mh = height - 1;
    let mw = width - 1;
    let east = 1;
    let southwest = width - 1;
    let south = width;
    let southeast = width + 1;
    let mut buf = vec![0.0; num_bins << 8];
    let mut grad_buf = vec![0.0; source.len()];
    let mut total_grad = 0.0;
    let mut max_grad = f32::NEG_INFINITY;
    for i in 1..mh {
        let ifl = i as f32;
        let bi = i * width;
        for j in 1..mw {
            let jfl = j as f32;
            let px = bi + j;
            let nw = unsafe { *source.get_unchecked(px - southeast) };
            let n = unsafe { *source.get_unchecked(px - south) };
            let ne = unsafe { *source.get_unchecked(px - southwest) };
            let w = unsafe { *source.get_unchecked(px - east) };
            let e = unsafe { *source.get_unchecked(px + east) };
            let sw = unsafe { *source.get_unchecked(px + southwest) };
            let s = unsafe { *source.get_unchecked(px + south) };
            let se = unsafe { *source.get_unchecked(px + southeast) };

            let sx = 10.0 * (e - w) + 3.0 * (ne + se - nw - sw);
            let sy = 10.0 * (n - s) + 3.0 * (ne + nw - se - sw);
            let grad = (sx * sx + sy * sy).powf(0.3).max(0.0);
            let angle_rad = (sy / sx).atan();
            if !angle_rad.is_nan() {
                let angle = (angle_rad * ANGS_PER_RAD + 128.0) as u8;
                let ind = angle as usize;
                let bin = (unsafe { *COS.get_unchecked(ind) } * ifl
                    + unsafe { *SIN.get_unchecked(ind) } * jfl
                    + diag) as usize
                    >> 1;
                let buf_ind = (bin << 8) | ind;
                let loc = unsafe { buf.get_unchecked_mut(buf_ind) };
                let val = *loc + grad / GRADIENT_OFFSET;
                *loc = val;
                max_grad = max_grad.max(val);
                for off in 1..=GRADIENT_ERROR {
                    let local_grad = grad / (off as f32 * off as f32 + GRADIENT_OFFSET);
                    let approx = angle.wrapping_add(off);
                    let ind = approx as usize;
                    let bin = (unsafe { *COS.get_unchecked(ind) } * ifl
                        + unsafe { *SIN.get_unchecked(ind) } * jfl
                        + diag) as usize
                        >> 1;
                    let buf_ind = (bin << 8) | ind;
                    let loc = unsafe { buf.get_unchecked_mut(buf_ind) };
                    let val = *loc + local_grad;
                    *loc = val;

                    let approx = angle.wrapping_sub(off);
                    let ind = approx as usize;
                    let bin = (unsafe { *COS.get_unchecked(ind) } * ifl
                        + unsafe { *SIN.get_unchecked(ind) } * jfl
                        + diag) as usize
                        >> 1;
                    let buf_ind = (bin << 8) | ind;
                    let loc = unsafe { buf.get_unchecked_mut(buf_ind) };
                    let val2 = *loc + local_grad;
                    *loc = val2;
                    max_grad = max_grad.max(val2.max(val));
                }
            }
            unsafe { *grad_buf.get_unchecked_mut(px) = grad };
            total_grad += grad;
        }
    }
    let avg_grad = total_grad / ((hf - 2.0) * (wf - 2.0));
    GradientVotesResult {
        height,
        width,
        diag,
        num_bins,
        buf,
        grad_buf,
        avg_grad,
        max_grad,
    }
}

// use wasm_bindgen::prelude::*;
// #[wasm_bindgen]
// #[derive(Clone, Copy)]
// pub struct Line {
//     pub angle: u8,
//     pub bin: usize,
//     pub score: f32,
// }

#[derive(Clone, Copy)]
pub struct Line {
    angle: u8,
    bin: usize,
    score: f32,
}
impl PartialEq for Line {
    fn eq(&self, other: &Self) -> bool {
        self.score.eq(&other.score)
    }
}
impl Eq for Line {}
impl PartialOrd for Line {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.score.partial_cmp(&other.score)
    }
}
impl Ord for Line {
    fn cmp(&self, other: &Self) -> Ordering {
        self.score.partial_cmp(&other.score).unwrap()
    }
}

pub fn edges(result: &GradientVotesResult, threshold: f32) -> Vec<Line> {
    assert!((0.0..1.0).contains(&threshold));
    let &GradientVotesResult {
        diag,
        num_bins,
        ref buf,
        max_grad,
        ..
    } = result;
    let threshold_val = threshold * max_grad;
    let mut lines = Vec::new();
    for bin in 0..num_bins {
        for angle in 0..256 {
            let val = unsafe { *buf.get_unchecked((bin << 8) | angle) };
            if val > threshold_val {
                lines.push(Line {
                    angle: angle as u8,
                    bin,
                    score: val,
                })
            }
        }
    }
    lines.truncate(5000);
    lines.sort_unstable_by(|a, b| b.cmp(a));
    let max_bin_err = (diag * HOUGH_MATCH_RATIO + 1.0) as usize;
    let mut i = 0;
    while i < lines.len() {
        let Line {
            bin,
            angle,
            mut score,
        } = lines[i];
        let mut j = i + 1;
        while j < lines.len() {
            let Line {
                bin: b2,
                angle: a2,
                score: s2,
            } = lines[j];
            let angle_diff = angle.wrapping_sub(a2);
            if bin.abs_diff(b2) <= max_bin_err
                && angle_diff.min(0u8.wrapping_sub(angle_diff)) <= MAX_ANG_ERROR
            {
                lines.remove(j);
                score += s2;
            } else {
                j += 1;
            }
        }
        lines[i].score = score;
        i += 1;
    }
    lines
}

#[inline]
fn right_err(l1: Line, l2: Line) -> f32 {
    let err = l1.angle.wrapping_sub(l2.angle).abs_diff(128) as f32;
    err * err + 3.0
}

pub fn documents(result: &GradientVotesResult, lines: &[Line]) -> Vec<ScoredQuad> {
    let &GradientVotesResult {
        width,
        height,
        diag,
        ref grad_buf,
        avg_grad,
        ..
    } = result;
    let hf = height as f32;
    let wf = width as f32;
    let intersection = |l1: Line, l2: Line| {
        let ang1 = l1.angle as usize;
        let ang2 = l2.angle as usize;
        let a = unsafe { *SIN.get_unchecked(ang1) };
        let b = unsafe { *COS.get_unchecked(ang1) };
        let c = (l1.bin << 1) as f32 - diag;
        let d = unsafe { *SIN.get_unchecked(ang2) };
        let e = unsafe { *COS.get_unchecked(ang2) };
        let f = (l2.bin << 1) as f32 - diag;

        let y = (a * f - d * c) / (a * e - d * b);
        let x = (c - y * b) / a;

        let xr = x / wf - 0.5;
        let yr = y / hf - 0.5;

        (Point { x, y }, xr * xr + yr * yr <= 0.55)
    };
    let iw = width as isize;
    let ih = height as isize;
    let score_between = |a: Point, b: Point| {
        let mut score = 0.0;

        let xf = b.x as isize;
        let yf = b.y as isize;

        let mut x = a.x as isize;
        let mut y = a.y as isize;

        let dx = (xf - x).abs();
        let dy = -(yf - y).abs();
        let sx = if x < xf { 1 } else { -1 };
        let sy = if y < yf { 1 } else { -1 };

        let mut error = dx + dy;

        while x != xf || y != yf {
            if 0 <= x && 0 <= y && x < iw && y < ih {
                score += unsafe { *grad_buf.as_ptr().offset(y * iw + x) } - avg_grad;
            }

            let e2 = error << 1;
            if e2 >= dy {
                error += dy;
                x += sx;
            }
            if e2 <= dx {
                error += dx;
                y += sy;
            }
        }

        (score * ((dx - dy) as f32).powf(-0.3)).max(0.0)
    };
    let scored_quad = |quad: Quad, l1: Line, l2: Line, l3: Line, l4: Line| {
        let edge_total = score_between(quad.a, quad.b)
            + score_between(quad.b, quad.c)
            + score_between(quad.c, quad.d)
            + score_between(quad.d, quad.a);
        let edge_score = edge_total.powf(3.0);

        let e12 = right_err(l1, l2);
        let e23 = right_err(l2, l3);
        let e34 = right_err(l3, l4);
        let e41 = right_err(l4, l1);
        let angle_score = (e12 * e12 + e23 * e23 + e34 * e34 + e41 * e41).powf(-0.1);

        let line_score = (l1.score * l2.score * l3.score * l4.score).powf(0.1);

        ScoredQuad {
            quad,
            score: edge_score * angle_score * line_score,
        }
    };
    let mut quads = Vec::new();
    for (i, &l1) in lines.iter().enumerate() {
        for (j, &l2) in lines.iter().enumerate().skip(i + 1) {
            let (i12, i12b) = intersection(l1, l2);
            for (k, &l3) in lines.iter().enumerate().skip(j + 1) {
                let (i13, i13b) = intersection(l1, l3);
                let (i23, i23b) = intersection(l2, l3);
                if i12b {
                    if i13b {
                        if !i23b {
                            for &l4 in lines.iter().skip(k + 1) {
                                let (_, i14b) = intersection(l1, l4);
                                let (i24, i24b) = intersection(l2, l4);
                                let (i34, i34b) = intersection(l3, l4);
                                if !i14b && i24b && i34b {
                                    quads.push(scored_quad(
                                        Quad {
                                            a: i12,
                                            b: i13,
                                            c: i34,
                                            d: i24,
                                        },
                                        l1,
                                        l3,
                                        l4,
                                        l2,
                                    ));
                                }
                            }
                        }
                    } else if i23b {
                        for &l4 in lines.iter().skip(k + 1) {
                            let (i14, i14b) = intersection(l1, l4);
                            let (_, i24b) = intersection(l2, l4);
                            let (i34, i34b) = intersection(l3, l4);
                            if i14b && !i24b && i34b {
                                quads.push(scored_quad(
                                    Quad {
                                        a: i12,
                                        b: i23,
                                        c: i34,
                                        d: i14,
                                    },
                                    l2,
                                    l3,
                                    l4,
                                    l1,
                                ));
                            }
                        }
                    }
                } else if i13b && i23b {
                    for &l4 in lines.iter().skip(k + 1) {
                        let (i14, i14b) = intersection(l1, l4);
                        let (i24, i24b) = intersection(l2, l4);
                        let (_, i34b) = intersection(l3, l4);
                        if i14b && i24b && !i34b {
                            quads.push(scored_quad(
                                Quad {
                                    a: i13,
                                    b: i23,
                                    c: i24,
                                    d: i14,
                                },
                                l3,
                                l2,
                                l4,
                                l1,
                            ));
                        }
                    }
                }
            }
        }
    }
    quads.sort_unstable_by(|a, b| b.cmp(a));
    quads
}
