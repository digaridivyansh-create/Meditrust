import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export const MEDIA_ASSETS = {
  heroVerification: '/src/assets/images/hero_medicine_verification_1795349975334.jpg',
  packScanner: '/src/assets/images/feature_pack_scanner_1795349975580.jpg',
  pharmacyDispensary: '/src/assets/images/feature_pharmacy_dispensary_1795349972129.jpg',
  patientCare: '/src/assets/images/login_patient_care_1795349975158.jpg',
  pharmacistLab: '/src/assets/images/login_pharmacist_lab_1795349974279.jpg',
} as const;

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({ src, alt, className = '', fallbackLabel }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0B1B2B] to-[#0D7377] text-white/90 p-6 ${className}`}
        role="img"
        aria-label={alt}
      >
        <ShieldCheck className="w-8 h-8 text-teal-300 mb-2" />
        <p className="font-display text-xs font-semibold text-center">
          {fallbackLabel || alt}
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

interface FeatureSpotlightProps {
  imageSrc: string;
  imageAlt: string;
  kickerEn: string;
  kickerHi: string;
  quoteEn: string;
  quoteHi: string;
  authorEn: string;
  authorHi: string;
  compact?: boolean;
}

export function FeatureSpotlight({
  imageSrc,
  imageAlt,
  kickerEn,
  kickerHi,
  quoteEn,
  quoteHi,
  authorEn,
  authorHi,
  compact = false,
}: FeatureSpotlightProps) {
  const { isHindi } = useLanguage();

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-12 items-stretch">
      <div className={`md:col-span-4 relative ${compact ? 'h-40 md:h-auto' : 'h-48 md:h-auto'}`}>
        <SafeImage
          src={imageSrc}
          alt={imageAlt}
          className="w-full h-full object-cover"
          fallbackLabel={isHindi ? kickerHi : kickerEn}
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#0B1B2B]/50 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-[#0B1B2B]/10"
          aria-hidden="true"
        />
      </div>
      <div className="md:col-span-8 p-5 sm:p-6 flex flex-col justify-center">
        <p className="text-xs font-semibold text-[#0D7377] mb-2">
          {isHindi ? kickerHi : kickerEn}
        </p>
        <blockquote className="font-display text-sm sm:text-base font-medium text-[#0B1B2B] leading-relaxed">
          “{isHindi ? quoteHi : quoteEn}”
        </blockquote>
        <p className="text-xs text-slate-500 mt-2.5">
          — {isHindi ? authorHi : authorEn}
        </p>
      </div>
    </div>
  );
}
