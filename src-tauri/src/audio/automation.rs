/// Paramètre d'automation supporté (sans allocation mémoire dans le callback).
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

/// Retourne la valeur interpolée linéairement entre les deux points d'automation
/// entourant `pos_beats`. Retourne `None` si la slice est vide.
///
/// `points` doit être trié par beats croissant (premier élément du tuple).
#[inline]
pub fn get_auto_value(points: &[(f64, f32)], pos_beats: f64) -> Option<f32> {
    if points.is_empty() {
        return None;
    }
    // idx = premier index dont la position dépasse pos_beats.
    let idx = points.partition_point(|p| p.0 <= pos_beats);
    if idx == 0 {
        // Avant le premier point : figer sur la première valeur.
        return Some(points[0].1);
    }
    if idx >= points.len() {
        // Après le dernier point : figer sur la dernière valeur.
        return Some(points[points.len() - 1].1);
    }
    let (b0, v0) = points[idx - 1];
    let (b1, v1) = points[idx];
    let span = b1 - b0;
    if span.abs() < f64::EPSILON {
        return Some(v1);
    }
    let t = ((pos_beats - b0) / span) as f32;
    Some(v0 + t * (v1 - v0))
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
}
