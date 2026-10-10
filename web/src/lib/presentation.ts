import { Activity, Building2, CloudLightning, Droplets, Flame, FlaskConical, HelpCircle, Mountain,
  ShieldAlert, Snowflake, Sun, Waves, Zap, Circle, GlassWater, CircleDashed, Syringe, Wind, Droplet, Thermometer, Accessibility, Heart, Baby, type LucideIcon } from 'lucide-react';
export const priorityLabels = ['GREEN · Minor','YELLOW · Serious but stable','RED · Life-threatening','BLACK · Deceased'] as const;
export const statusLabels = ['Sheltered','Exposed','Trapped','Unknown'] as const;
export const locationLabels = ['Direct / on scene','Nearby offset','Landmark','Street address'] as const;
export const medicalLabels = ['Insulin','Oxygen','Bleeding','Hypothermia','Mobility assistance','Cardiac','Pregnancy / infant','Burns'] as const;
export const hazardLabels = ['No hazard','Flood','Fire / smoke','Structural collapse','Hazmat / gas','Electrical / power',
  'Extreme weather','Medical crisis','Active violence','Tsunami / surge','Landslide','Hypothermia / freeze',
  'Heat stroke','Sinkhole / subsidence','Contaminated water','Other'] as const;
/** T4's proposed shared mapping; T3 can import/copy this when coordinating icons. */
export const hazardIcons: readonly LucideIcon[] = [Circle,Droplets,Flame,Building2,FlaskConical,Zap,CloudLightning,
  Activity,ShieldAlert,Waves,Mountain,Snowflake,Sun,CircleDashed,GlassWater,HelpCircle];

export const medicalIcons: readonly LucideIcon[] = [Syringe,Wind,Droplet,Thermometer,Accessibility,Heart,Baby,Flame];
