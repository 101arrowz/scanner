use core::cmp::Ordering;

use super::super::Image;
use alloc::vec::Vec;

use super::{Point, Quad, ScoredQuad, consts::{COS, SIN, ANGS_PER_RAD, GRADIENT_ERROR, HOUGH_MATCH_RATIO, MAX_ANG_ERROR}};

pub struct GradientVotesResult {
    height: usize,
    width: usize,
    diag: f32,
    num_bins: usize,
    buf: Vec<f32>,
    grad_buf: Vec<f32>,
    avg_grad: f32,
    max_grad: f32
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
            let nw = source[px - southeast];
            let n = source[px - south];
            let ne = source[px - southwest];
            let w = source[px - east];
            let e = source[px + east];
            let sw = source[px + southwest];
            let s = source[px + south];
            let se = source[px + southeast];
            
            let sx = 10.0 * (e - w) + 3.0 * (ne + se - nw - sw);
            let sy = 10.0 * (n - s) + 3.0 * (ne + nw - se - sw);
            let grad = (sx * sx + sy * sy).powf(0.3).max(0.0);
            let angle = ((sy / sx).atan() * ANGS_PER_RAD + 128.0) as u8;
            for off in 0..=GRADIENT_ERROR {
                let local_grad = grad / (off * off + 3) as f32;
                let approx = angle.wrapping_add(off);
                let ind = approx as usize;
                let bin = (COS[ind] * ifl + SIN[ind] * jfl + diag) as usize >> 1;
                let buf_ind = (bin << 8) | ind;
                let val = buf[buf_ind] + local_grad;
                buf[buf_ind] = val;
                
                let approx = angle.wrapping_sub(off);
                let ind = approx as usize;
                let bin = (COS[ind] * ifl + SIN[ind] * jfl + diag) as usize >> 1;
                let buf_ind = (bin << 8) | ind;
                let val2 = buf[buf_ind] + local_grad;
                buf[buf_ind] = val2;
                max_grad = max_grad.max(val2.max(val));
            }
            grad_buf[bi + j] = grad;
            total_grad += grad;
        }
    }
    let avg_grad = total_grad / ((hf - 2.0) * (wf - 2.0));
    GradientVotesResult { height, width, diag, num_bins, buf, grad_buf, avg_grad, max_grad }
}

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
    assert!(0.0 <= threshold && threshold < 1.0);
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
            let val = buf[(bin << 8) | angle];
            if val > threshold_val {
                lines.push(Line {
                    angle: angle as u8,
                    bin,
                    score: val
                })
            }
        }
    }
    lines.sort_unstable();
    let max_bin_err = (diag * HOUGH_MATCH_RATIO + 1.0) as usize;
    for i in 0..lines.len() {
        let Line { bin, angle, mut score } = lines[i];
        let mut j = i + 1;
        while j < lines.len() {
            let Line { bin: b2, angle: a2, score: s2 } = lines[j];
            let angle_diff = angle.abs_diff(a2);
            if bin.abs_diff(b2) <= max_bin_err && angle_diff.min(255 - angle_diff + 1) <= MAX_ANG_ERROR {
                lines.swap_remove(j);
                score += s2;
            } else {
                j += 1;
            }
        }
        lines[i].score = score;
    }
    lines
}

pub fn documents(result: &GradientVotesResult, lines: &[Line]) -> Vec<ScoredQuad> {
    let &GradientVotesResult {
        width,
        height,
        num_bins,
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
        let a = SIN[ang1];
        let b = COS[ang1];
        let c = (l1.bin << 1) as f32 - diag;
        let d = SIN[ang2];
        let e = COS[ang2];
        let f = (l2.bin << 1) as f32 - diag;
        
        let y = (a * f - d * c) / (a * e - d * b);
        let x = (c - y * b) / a;

        let xr = x / wf - 0.5;
        let yr = y / hf - 0.5;

        (Point { x, y }, x * x + y * y <= 0.55)
    };
    let score_between = |a: Point, b: Point| {
        let score = grad_buf[0];
        score
    };
    let scored_quad = |quad: Quad, l1: Line, l2: Line, l3: Line, l4: Line| {
        ScoredQuad {
            quad,
            score: f32::NAN // todo
        }
    };
    let mut quads = Vec::new();
    for (i, &l1) in lines.iter().enumerate() {
        for (j, &l2) in lines.iter().enumerate().skip(i) {
            let (i12, i12b) = intersection(l1, l2);
            for (k, &l3) in lines.iter().enumerate().skip(j) {
                let (i13, i13b) = intersection(l1, l3);
                let (i23, i23b) = intersection(l2, l3);
                if i12b {
                    if i13b {
                        if !i23b {
                            for &l4 in lines.iter().skip(k) {
                                let (_, i14b) = intersection(l1, l4);
                                let (i24, i24b) = intersection(l2, l4);
                                let (i34, i34b) = intersection(l3, l4);
                                if !i14b && i24b && i34b {
                                    quads.push(scored_quad(Quad {
                                        a: i12,
                                        b: i13,
                                        c: i34,
                                        d: i24
                                    }, l1, l3, l4, l2));
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Vec::new()
}