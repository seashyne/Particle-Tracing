import type { Vector3Tuple } from "../core/types.js";

/**
 * Calculates the wavelength-dependent Index of Refraction (IOR)
 * using the Cauchy dispersion formula calibrated by Abbe number (V_d).
 *
 * @param baseIor - Base index of refraction at Fraunhofer d-line (587.6 nm, e.g. 1.50 for crown glass)
 * @param wavelengthNm - Light wavelength in nanometers (380 nm - 780 nm)
 * @param abbeNumber - Dispersion metric V_d (lower value = stronger dispersion/rainbow, e.g. 30 for dense flint, 60 for crown glass)
 * @returns Dispersed index of refraction n(lambda)
 */
export const computeSpectralIor = (
  baseIor: number,
  wavelengthNm: number,
  abbeNumber = 50.0
): number => {
  // Fraunhofer lines in micrometers
  const lambdaD = 0.5876; // yellow helium
  const lambdaF = 0.4861; // blue hydrogen
  const lambdaC = 0.6563; // red hydrogen

  // Convert target wavelength to micrometers
  const lambdaMicrons = Math.max(0.38, Math.min(0.78, wavelengthNm / 1000.0));

  // Cauchy coefficient B is approximately the base refractive index
  // Cauchy coefficient C is derived from the Abbe number: V_d = (n_d - 1) / (n_F - n_C)
  // n_F - n_C = C * (1 / lambda_F^2 - 1 / lambda_C^2)
  const deltaInvLambda2 = 1.0 / (lambdaF * lambdaF) - 1.0 / (lambdaC * lambdaC);
  const coefficientC = Math.max(0.0001, (baseIor - 1.0) / (abbeNumber * deltaInvLambda2));
  const coefficientB = baseIor - coefficientC / (lambdaD * lambdaD);

  return coefficientB + coefficientC / (lambdaMicrons * lambdaMicrons);
};

/**
 * Converts a spectral wavelength in nanometers (380nm to 780nm)
 * into a linear RGB color tuple [r, g, b] in range [0, 1].
 */
export const wavelengthToRgb = (wavelengthNm: number): Vector3Tuple => {
  const wl = Math.max(380, Math.min(780, wavelengthNm));
  let r = 0;
  let g = 0;
  let b = 0;

  if (wl >= 380 && wl < 440) {
    r = -(wl - 440) / (440 - 380);
    g = 0.0;
    b = 1.0;
  } else if (wl >= 440 && wl < 490) {
    r = 0.0;
    g = (wl - 440) / (490 - 440);
    b = 1.0;
  } else if (wl >= 490 && wl < 510) {
    r = 0.0;
    g = 1.0;
    b = -(wl - 510) / (510 - 490);
  } else if (wl >= 510 && wl < 580) {
    r = (wl - 510) / (580 - 510);
    g = 1.0;
    b = 0.0;
  } else if (wl >= 580 && wl < 645) {
    r = 1.0;
    g = -(wl - 645) / (645 - 580);
    b = 0.0;
  } else if (wl >= 645 && wl <= 780) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }

  // Vision sensitivity falloff at vision boundaries
  let factor = 0.0;
  if (wl >= 380 && wl < 420) {
    factor = 0.3 + (0.7 * (wl - 380)) / (420 - 380);
  } else if (wl >= 420 && wl <= 700) {
    factor = 1.0;
  } else if (wl > 700 && wl <= 780) {
    factor = 0.3 + (0.7 * (780 - wl)) / (780 - 700);
  }

  return [
    Math.min(1.0, Math.max(0.0, r * factor)),
    Math.min(1.0, Math.max(0.0, g * factor)),
    Math.min(1.0, Math.max(0.0, b * factor))
  ];
};
