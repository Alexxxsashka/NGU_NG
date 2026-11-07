import {
 Bell, Boxes, CalendarDays, ChartNoAxesCombined, ClipboardCheck, ClipboardList,
 FileBadge, FileText, FolderOpen, GraduationCap, History, House, Megaphone,
 Network, Settings, ShieldCheck, Target, UserRound, Users, Wallet,
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

const icons:Record<string,LucideIcon>={
 '/':House,'/weekly-bonus/me':UserRound,'/weekly-bonus':Wallet,
 '/portal/notifications':Bell,'/portal/personnel':Users,'/portal/structure':Network,
 '/portal/personnel-actions':FileBadge,'/portal/calendar':CalendarDays,'/portal/requests':ClipboardList,
 '/portal/logistics':Boxes,'/portal/training':GraduationCap,'/portal/lectures':FolderOpen,
 '/portal/exercises':Target,'/portal/payments':Wallet,'/portal/statistics':ChartNoAxesCombined,
 '/portal/regulations':FileText,'/portal/orders':ClipboardCheck,'/portal/announcements':Megaphone,
 '/portal/command':ShieldCheck,'/portal/administration':Settings,'/portal/audit':History,
};

export function PortalIcon({href,size=18}:{href:string;size?:number}){
 const Icon=icons[href]??ClipboardList;
 return <Icon size={size} aria-hidden="true"/>;
}
