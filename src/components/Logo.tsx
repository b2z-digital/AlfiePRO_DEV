import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'small' }) => {
  const sizeClasses = {
    small: 'w-8 h-8',
    medium: 'w-12 h-12',
    large: 'w-16 h-16',
    xlarge: 'w-24 h-24'
  };

  return (
    <svg
      viewBox="0 0 129.34 201.37"
      className={`${sizeClasses[size]} ${className}`}
      aria-hidden="true"
    >
      <path 
        fill="#0066b4" 
        d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z"
      />
      <path 
        fill="#01a2e9" 
        d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z"
      />
    </svg>
  );
};