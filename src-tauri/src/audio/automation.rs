/// Paramètre d'automation supporté.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutomationParam {
    Volume,
    Pan,
}

impl AutomationParam {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "volume" => Some(Self::Volume),
            "pan"    => Some(Self::Pan),
            _        => None,
        }
    }
}

/// Type de courbe d'interpolation entre deux points d'automation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CurveType {
    Linear,    // Ligne droite (Phase 4)
    EaseIn,    // Logarithmique (départ lent, arrivée rapide)
    EaseOut,   // Exponentielle (départ rapide, arrivée lente)
    SCurve,    // S-Curve (lent → rapide → lent)
}

impl Default for CurveType {
    fn default() -> Self { CurveType::Linear }
}

impl CurveType {
    pub fn from_index(i: u32) -> Self {
        match i {
            1 => Self::EaseIn,
            2 => Self::EaseOut,
            3 => Self::SCurve,
            _ => Self::Linear,
        }
    }
}

/// Point d'automation avec type de courbe vers le point suivant.
/// Le tuple format dans les vecs existants est (beats, value, curve_type_index).
/// Pour la rétrocompatibilité, on garde le format (f64, f32) et on stocke
/// les curve types dans un vec parallèle.

/// Retourne la valeur interpolée entre deux points avec courbe.
#[inline]
fn interpolate(t: f32, curve: CurveType, v0: f32, v1: f32) -> f32 {
    let shaped_t = match curve {
        CurveType::Linear => t,
        CurveType::EaseIn => t * t, // Quadratique in
        CurveType::EaseOut => 1.0 - (1.0 - t) * (1.0 - t), // Quadratique out
        CurveType::SCurve => {
            // Smoothstep : 3t² - 2t³
            t * t * (3.0 - 2.0 * t)
        }
    };
    v0 + shaped_t * (v1 - v0)
}

/// Retourne la valeur interpolée entre les deux points d'automation
/// entourant `pos_beats`. Retourne `None` si la slice est vide.
///
/// `points` : (beats, value) trié par beats croissant.
/// `curves` : type de courbe de chaque segment (même longueur que points ou vide).
#[inline]
pub fn get_auto_value_curved(
    points: &[(f64, f32)],
    curves: &[CurveType],
    pos_beats: f64,
) -> Option<f32> {
    if points.is_empty() {
        return None;
    }
    let idx = points.partition_point(|p| p.0 <= pos_beats);
    if idx == 0 {
        return Some(points[0].1);
    }
    if idx >= points.len() {
        return Some(points[points.len() - 1].1);
    }
    let (b0, v0) = points[idx - 1];
    let (b1, v1) = points[idx];
    let span = b1 - b0;
    if span.abs() < f64::EPSILON {
        return Some(v1);
    }
    let t = ((pos_beats - b0) / span) as f32;
    let curve = curves.get(idx - 1).copied().unwrap_or(CurveType::Linear);
    Some(interpolate(t, curve, v0, v1))
}

/// Version rétrocompatible (linéaire uniquement).
#[inline]
pub fn get_auto_value(points: &[(f64, f32)], pos_beats: f64) -> Option<f32> {
    get_auto_value_curved(points, &[], pos_beats)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_points_returns_none() {
        assert_eq!(get_auto_value(&[], 1.0), None);
    }

    #[test]
    fn single_point_returns_its_value() {
        let pts = [(2.0f64, 0.5f32)];
        assert_eq!(get_auto_value(&pts, 0.0), Some(0.5));
        assert_eq!(get_auto_value(&pts, 2.0), Some(0.5));
        assert_eq!(get_auto_value(&pts, 5.0), Some(0.5));
    }

    #[test]
    fn interpolation_midpoint() {
        let pts = [(0.0f64, 0.0f32), (4.0f64, 1.0f32)];
        let v = get_auto_value(&pts, 2.0).unwrap();
        assert!((v - 0.5).abs() < 1e-5, "expected 0.5, got {v}");
    }

    #[test]
    fn before_first_point_clamps() {
        let pts = [(2.0f64, 0.8f32), (4.0f64, 0.4f32)];
        assert_eq!(get_auto_value(&pts, 0.0), Some(0.8));
    }

    #[test]
    fn after_last_point_clamps() {
        let pts = [(2.0f64, 0.8f32), (4.0f64, 0.4f32)];
        assert_eq!(get_auto_value(&pts, 10.0), Some(0.4));
    }

    #[test]
    fn ease_in_starts_slow() {
        let pts = [(0.0f64, 0.0f32), (4.0f64, 1.0f32)];
        let curves = [CurveType::EaseIn];
        let v = get_auto_value_curved(&pts, &curves, 1.0).unwrap(); // t=0.25
        // EaseIn at t=0.25 → 0.0625, so value ≈ 0.0625
        assert!(v < 0.15, "EaseIn should be slow at start: {v}");
    }

    #[test]
    fn ease_out_starts_fast() {
        let pts = [(0.0f64, 0.0f32), (4.0f64, 1.0f32)];
        let curves = [CurveType::EaseOut];
        let v = get_auto_value_curved(&pts, &curves, 1.0).unwrap(); // t=0.25
        // EaseOut at t=0.25 → 1-(0.75)² = 0.4375
        assert!(v > 0.35, "EaseOut should be fast at start: {v}");
    }

    #[test]
    fn scurve_midpoint_is_halfway() {
        let pts = [(0.0f64, 0.0f32), (4.0f64, 1.0f32)];
        let curves = [CurveType::SCurve];
        let v = get_auto_value_curved(&pts, &curves, 2.0).unwrap(); // t=0.5
        // Smoothstep at t=0.5 → 0.5
        assert!((v - 0.5).abs() < 0.01, "S-curve at midpoint should be 0.5: {v}");
    }
}
