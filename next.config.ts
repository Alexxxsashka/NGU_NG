import type { NextConfig } from 'next';
const config: NextConfig = {
  async redirects() {
    return [
      {source:'/report',destination:'/weekly-bonus/report',permanent:true},
      {source:'/me',destination:'/weekly-bonus/me',permanent:true},
      ...['overview','reports','tasks','periods','settings','import'].map(section => ({
        source:'/admin/'+section,destination:'/admin/weekly-bonus/'+section,permanent:true,
      })),
      {source:'/admin/units/:unitId?',destination:'/admin/weekly-bonus/units/:unitId?',permanent:true},
    ];
  },
  poweredByHeader: false,
  async headers() { return [{source:'/(.*)', headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}
  ]}]; }
};
export default config;
