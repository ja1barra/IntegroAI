import type { FC } from 'react'

export function HubSpotLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <path d="M307.4 164.3v-49.3a40.3 40.3 0 0 0 23.3-36.3V77.8a40.4 40.4 0 0 0-80.7 0v.9a40.3 40.3 0 0 0 23.3 36.3v49.3a114.4 114.4 0 0 0-54.4 23.9L89.7 93.5a45 45 0 1 0-24.3 21.2l124.5 92.4a114.2 114.2 0 0 0-16.9 60.1c0 62.9 51.1 114 114 114s114-51.1 114-114a113.9 113.9 0 0 0-93.6-112zM287.1 341.7a66.4 66.4 0 1 1 66.4-66.4 66.5 66.5 0 0 1-66.4 66.4z" fill="#FF7A59"/>
    </svg>
  )
}

export function ApolloLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <circle cx="100" cy="100" r="100" fill="#3B82F6"/>
      <path d="M100 30 L118 85 H82 Z" fill="white"/>
      <path d="M100 170 L82 115 H118 Z" fill="white" opacity="0.7"/>
      <path d="M30 100 L85 82 V118 Z" fill="white" opacity="0.7"/>
      <path d="M170 100 L115 118 V82 Z" fill="white"/>
      <circle cx="100" cy="100" r="18" fill="white"/>
    </svg>
  )
}

export function SlackLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 127 127" xmlns="http://www.w3.org/2000/svg">
      <path d="M27.2 80a13.6 13.6 0 1 1-13.6-13.6H27.2V80z" fill="#E01E5A"/>
      <path d="M33.9 80a13.6 13.6 0 0 1 27.2 0v34.1a13.6 13.6 0 0 1-27.2 0V80z" fill="#E01E5A"/>
      <path d="M47.5 27.2a13.6 13.6 0 1 1 13.6-13.6V27.2H47.5z" fill="#36C5F0"/>
      <path d="M47.5 33.9a13.6 13.6 0 0 1 0 27.2H13.4a13.6 13.6 0 0 1 0-27.2H47.5z" fill="#36C5F0"/>
      <path d="M100.3 47.5a13.6 13.6 0 1 1 13.6 13.6h-13.6V47.5z" fill="#2EB67D"/>
      <path d="M93.6 47.5a13.6 13.6 0 0 1-27.2 0V13.4a13.6 13.6 0 0 1 27.2 0v34.1z" fill="#2EB67D"/>
      <path d="M79.9 100.3a13.6 13.6 0 1 1-13.6 13.6v-13.6H79.9z" fill="#ECB22E"/>
      <path d="M79.9 93.6a13.6 13.6 0 0 1 0-27.2h34.1a13.6 13.6 0 0 1 0 27.2H79.9z" fill="#ECB22E"/>
    </svg>
  )
}

export function KlaviyoLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="16" fill="#231F20"/>
      <path d="M22 20 H42 V50 L62 20 H86 L62 52 L86 80 H62 L42 50 V80 H22 Z" fill="white"/>
    </svg>
  )
}

export function SalesforceLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 67" xmlns="http://www.w3.org/2000/svg">
      <path d="M41.6 7.2a20.7 20.7 0 0 1 14.8-6.2 20.9 20.9 0 0 1 18.7 11.6 16.2 16.2 0 0 1 7.1-1.6 16.4 16.4 0 0 1 16.4 16.4 16.4 16.4 0 0 1-16.4 16.4H16.4A16.4 16.4 0 0 1 0 27.4a16.4 16.4 0 0 1 21.9-15.4A20.7 20.7 0 0 1 41.6 7.2z" fill="#00A1E0"/>
    </svg>
  )
}

export function OutreachLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#5951FF"/>
      <path d="M50 20C32 20 18 34 18 52c0 18 14 32 32 32 18 0 32-14 32-32 0-18-14-32-32-32zm0 48c-10 0-18-8-18-18s8-18 18-18 18 8 18 18-8 18-18 18z" fill="white"/>
      <circle cx="50" cy="50" r="10" fill="white"/>
    </svg>
  )
}

export function LinkedInLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="14" fill="#0A66C2"/>
      <path d="M23 38h14v39H23zM30 32a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM44 38h13v5.3s3.5-6.3 13-6.3c10.8 0 16 7.3 16 19.5V77H72V58c0-5.7-1.9-9.5-7-9.5-6.5 0-9 4.9-9 10V77H44z" fill="white"/>
    </svg>
  )
}

export function GongLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#6B2BD6"/>
      <path d="M50 18C32 18 18 32 18 50c0 18 14 32 32 32 18 0 32-14 32-32" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round"/>
      <path d="M50 30c-12 0-22 10-22 22 0 12 10 22 22 22" stroke="white" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.7"/>
      <circle cx="50" cy="50" r="8" fill="white"/>
    </svg>
  )
}

export function IntercomLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="18" fill="#1F8FED"/>
      <path d="M50 18c-17.7 0-32 14.3-32 32 0 6.5 1.9 12.5 5.2 17.5L20 82l14.8-3.1C39.5 81.2 44.6 82 50 82c17.7 0 32-14.3 32-32S67.7 18 50 18zm-16 28h32v6H34zm0-12h32v6H34z" fill="white"/>
    </svg>
  )
}

export function ZapierLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 0 L100 50 L50 100 L0 50 Z" fill="#FF4A00"/>
      <path d="M34 42 L66 42 L34 58 L66 58" stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function GA4Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="55" width="18" height="35" rx="4" fill="#F9AB00"/>
      <rect x="41" y="30" width="18" height="60" rx="4" fill="#E37400"/>
      <rect x="72" y="10" width="18" height="80" rx="4" fill="#E37400" opacity="0.7"/>
      <circle cx="81" cy="10" r="10" fill="#E37400"/>
    </svg>
  )
}

export function RequestIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" stroke="#b0a99a" strokeWidth="3" fill="none"/>
      <line x1="50" y1="24" x2="50" y2="76" stroke="#b0a99a" strokeWidth="6" strokeLinecap="round"/>
      <line x1="24" y1="50" x2="76" y2="50" stroke="#b0a99a" strokeWidth="6" strokeLinecap="round"/>
    </svg>
  )
}

export const LOGO_MAP: Record<string, FC<{ size?: number }>> = {
  hubspot:    HubSpotLogo,
  apollo:     ApolloLogo,
  slack:      SlackLogo,
  klaviyo:    KlaviyoLogo,
  salesforce: SalesforceLogo,
  outreach:   OutreachLogo,
  linkedin:   LinkedInLogo,
  gong:       GongLogo,
  intercom:   IntercomLogo,
  zapier:     ZapierLogo,
  ga4:        GA4Logo,
  request:    RequestIcon,
}
