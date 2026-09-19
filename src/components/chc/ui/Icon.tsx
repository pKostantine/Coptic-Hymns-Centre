import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'chevron-back'
  | 'chevron-forward'
  | 'chevron-down'
  | 'bookmark'
  | 'bookmark-outline'
  | 'calendar-outline'
  | 'settings-outline'
  | 'time-outline'
  | 'add'
  | 'remove'
  | 'book'
  | 'library-outline'
  | 'school-outline'
  | 'list-outline'
  | 'sunny'
  | 'moon'
  | 'close-fullscreen'
  | 'open-in-full'
  | 'search-outline'
  | 'eye-outline'
  | 'checkmark'
  | 'play'
  | 'pause'
  | 'play-skip-forward'
  | 'play-skip-back'
  | 'reorder'
  | 'close'
  | 'shuffle'
  | 'repeat'
  | 'heart'
  | 'heart-outline'
  | 'musical-notes';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * CHC's local icon set — every glyph the app uses, vendored as inline SVG
 * path data (sourced from the Ionicons and Material Symbols projects) and
 * rendered via react-native-svg. Deliberately not @expo/vector-icons: no
 * icon-font package or glyph lookup at runtime, just local vector data
 * bundled directly into the app, the same way the category PNGs are.
 */
export default function Icon({ name, size = 24, color = '#FFFFFF', style }: IconProps) {
  switch (name) {
    case 'chevron-back':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M328 112 184 256l144 144" fill="none" stroke={color} strokeWidth={48} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'chevron-forward':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="m184 112 144 144-144 144" fill="none" stroke={color} strokeWidth={48} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'eye-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 0 0-.27 17.77C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 0 0 0-17.47C429.18 172.28 348.68 112 255.66 112Z"
            fill="none"
            stroke={color}
            strokeWidth={32}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx="256" cy="256" r="80" fill="none" stroke={color} strokeWidth={32} strokeMiterlimit={10} />
        </Svg>
      );
    case 'search-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M221 400a179 179 0 1 0 0-358 179 179 0 0 0 0 358Z" fill="none" stroke={color} strokeWidth={32} strokeMiterlimit={10} />
          <Path d="M338 338 471 471" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeMiterlimit={10} />
        </Svg>
      );
    case 'checkmark':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M416 128 176 384l-80-80" fill="none" stroke={color} strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'chevron-down':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="m112 184 144 144 144-144" fill="none" stroke={color} strokeWidth={48} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'bookmark-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M352 48H160a48 48 0 0 0-48 48v368l144-128 144 128V96a48 48 0 0 0-48-48"
            fill="none"
            stroke={color}
            strokeWidth={32}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'bookmark':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M400 480a16 16 0 0 1-10.63-4L256 357.41 122.63 476A16 16 0 0 1 96 464V96a64.07 64.07 0 0 1 64-64h192a64.07 64.07 0 0 1 64 64v368a16 16 0 0 1-16 16"
            fill={color}
          />
        </Svg>
      );
    case 'calendar-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Rect x={48} y={80} width={416} height={384} rx={48} fill="none" stroke={color} strokeWidth={32} strokeLinejoin="round" />
          <Circle cx={296} cy={232} r={24} fill={color} />
          <Circle cx={376} cy={232} r={24} fill={color} />
          <Circle cx={296} cy={312} r={24} fill={color} />
          <Circle cx={376} cy={312} r={24} fill={color} />
          <Circle cx={136} cy={312} r={24} fill={color} />
          <Circle cx={216} cy={312} r={24} fill={color} />
          <Circle cx={136} cy={392} r={24} fill={color} />
          <Circle cx={216} cy={392} r={24} fill={color} />
          <Circle cx={296} cy={392} r={24} fill={color} />
          <Path d="M128 48v32M384 48v32" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M464 160H48" fill="none" stroke={color} strokeWidth={32} strokeLinejoin="round" />
        </Svg>
      );
    case 'settings-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M262.29 192.31a64 64 0 1 0 57.4 57.4 64.13 64.13 0 0 0-57.4-57.4M416.39 256a154 154 0 0 1-1.53 20.79l45.21 35.46a10.81 10.81 0 0 1 2.45 13.75l-42.77 74a10.81 10.81 0 0 1-13.14 4.59l-44.9-18.08a16.11 16.11 0 0 0-15.17 1.75A164.5 164.5 0 0 1 325 400.8a15.94 15.94 0 0 0-8.82 12.14l-6.73 47.89a11.08 11.08 0 0 1-10.68 9.17h-85.54a11.11 11.11 0 0 1-10.69-8.87l-6.72-47.82a16.07 16.07 0 0 0-9-12.22 155 155 0 0 1-21.46-12.57 16 16 0 0 0-15.11-1.71l-44.89 18.07a10.81 10.81 0 0 1-13.14-4.58l-42.77-74a10.8 10.8 0 0 1 2.45-13.75l38.21-30a16.05 16.05 0 0 0 6-14.08c-.36-4.17-.58-8.33-.58-12.5s.21-8.27.58-12.35a16 16 0 0 0-6.07-13.94l-38.19-30A10.81 10.81 0 0 1 49.48 186l42.77-74a10.81 10.81 0 0 1 13.14-4.59l44.9 18.08a16.11 16.11 0 0 0 15.17-1.75A164.5 164.5 0 0 1 187 111.2a15.94 15.94 0 0 0 8.82-12.14l6.73-47.89A11.08 11.08 0 0 1 213.23 42h85.54a11.11 11.11 0 0 1 10.69 8.87l6.72 47.82a16.07 16.07 0 0 0 9 12.22 155 155 0 0 1 21.46 12.57 16 16 0 0 0 15.11 1.71l44.89-18.07a10.81 10.81 0 0 1 13.14 4.58l42.77 74a10.8 10.8 0 0 1-2.45 13.75l-38.21 30a16.05 16.05 0 0 0-6.05 14.08c.33 4.14.55 8.3.55 12.47"
            fill="none"
            stroke={color}
            strokeWidth={32}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'time-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64Z"
            fill="none"
            stroke={color}
            strokeWidth={32}
            strokeMiterlimit={10}
          />
          <Path d="M256 128v144h96" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'add':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M256 112v288M400 256H112" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'remove':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M400 256H112" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'book':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M256 112c-39.21-31.36-86.4-48-136-48H80a32 32 0 0 0-32 32v272a32 32 0 0 0 32 32h40c49.6 0 96.79 16.64 136 48 39.21-31.36 86.4-48 136-48h40a32 32 0 0 0 32-32V96a32 32 0 0 0-32-32h-40c-49.6 0-96.79 16.64-136 48Z"
            fill={color}
          />
          <Path d="M256 112v336" fill="none" stroke="#071A2A" strokeWidth={28} strokeLinecap="round" />
        </Svg>
      );
    case 'library-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Rect x={32} y={96} width={64} height={368} rx={16} ry={16} fill="none" stroke={color} strokeWidth={32} strokeLinejoin="round" />
          <Path d="M112 224h128M112 400h128" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <Rect x={112} y={160} width={128} height={304} rx={16} ry={16} fill="none" stroke={color} strokeWidth={32} strokeLinejoin="round" />
          <Rect x={256} y={48} width={96} height={416} rx={16} ry={16} fill="none" stroke={color} strokeWidth={32} strokeLinejoin="round" />
          <Path
            d="m422.46 96.11-40.4 4.25c-11.12 1.17-19.18 11.57-17.93 23.1l34.92 321.59c1.26 11.53 11.37 20 22.49 18.84l40.4-4.25c11.12-1.17 19.18-11.57 17.93-23.1L445 115c-1.31-11.58-11.42-20.06-22.54-18.89Z"
            fill="none"
            stroke={color}
            strokeWidth={32}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'school-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M32 176 256 64l224 112-224 112L32 176Z"
            fill="none"
            stroke={color}
            strokeWidth={30}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M112 224v112c0 42 65 80 144 80s144-38 144-80V224M480 176v144"
            fill="none"
            stroke={color}
            strokeWidth={30}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'list-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M160 144h288M160 256h288M160 368h288" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={80} cy={144} r={16} fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={80} cy={256} r={16} fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={80} cy={368} r={16} fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'sunny':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M256 118a22 22 0 0 1-22-22V48a22 22 0 0 1 44 0v48a22 22 0 0 1-22 22M256 486a22 22 0 0 1-22-22v-48a22 22 0 0 1 44 0v48a22 22 0 0 1-22 22M369.14 164.86a22 22 0 0 1-15.56-37.55l33.94-33.94a22 22 0 0 1 31.11 31.11l-33.94 33.94a21.93 21.93 0 0 1-15.55 6.44M108.92 425.08a22 22 0 0 1-15.55-37.56l33.94-33.94a22 22 0 1 1 31.11 31.11l-33.94 33.94a21.94 21.94 0 0 1-15.56 6.45M464 278h-48a22 22 0 0 1 0-44h48a22 22 0 0 1 0 44M96 278H48a22 22 0 0 1 0-44h48a22 22 0 0 1 0 44M403.08 425.08a21.94 21.94 0 0 1-15.56-6.45l-33.94-33.94a22 22 0 0 1 31.11-31.11l33.94 33.94a22 22 0 0 1-15.55 37.56M142.86 164.86a21.9 21.9 0 0 1-15.55-6.44l-33.94-33.94a22 22 0 0 1 31.11-31.11l33.94 33.94a22 22 0 0 1-15.56 37.55M256 358a102 102 0 1 1 102-102 102.12 102.12 0 0 1-102 102"
            fill={color}
          />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M264 480A232 232 0 0 1 32 248c0-94 54-178.28 137.61-214.67a16 16 0 0 1 21.06 21.06C181.07 76.43 176 104.66 176 136c0 110.28 89.72 200 200 200 31.34 0 59.57-5.07 81.61-14.67a16 16 0 0 1 21.06 21.06C442.28 426 358 480 264 480"
            fill={color}
          />
        </Svg>
      );
    case 'close-fullscreen':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
          <Path
            d="M22 3.41L16.71 8.7L20 12h-8V4l3.29 3.29L20.59 2L22 3.41zM3.41 22l5.29-5.29L12 20v-8H4l3.29 3.29L2 20.59L3.41 22z"
            fill={color}
          />
        </Svg>
      );
    case 'open-in-full':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
          <Path d="M21 11V3h-8l3.29 3.29l-10 10L3 13v8h8l-3.29-3.29l10-10z" fill={color} />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M133 440a35.37 35.37 0 0 1-17.5-4.67c-12-6.8-19.46-20-19.46-34.33V111c0-14.37 7.46-27.53 19.46-34.33a35.13 35.13 0 0 1 35.77.45l247.85 148.36a36 36 0 0 1 0 61l-247.89 148.4A35.5 35.5 0 0 1 133 440z"
            fill={color}
          />
        </Svg>
      );
    case 'pause':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Rect x={136} y={80} width={80} height={352} rx={22} fill={color} />
          <Rect x={296} y={80} width={80} height={352} rx={22} fill={color} />
        </Svg>
      );
    case 'play-skip-forward':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M96 111v290c0 17.44 17 28.52 31 20.16l247.9-148.37c12.12-7.25 12.12-26.33 0-33.58L127 90.84c-14-8.36-31 2.72-31 20.16z"
            fill={color}
          />
          <Rect x={376} y={80} width={48} height={352} rx={24} fill={color} />
        </Svg>
      );
    case 'play-skip-back':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M416 111v290c0 17.44-17 28.52-31 20.16L137.1 272.79c-12.12-7.25-12.12-26.33 0-33.58L385 90.84c14-8.36 31 2.72 31 20.16z"
            fill={color}
          />
          <Rect x={88} y={80} width={48} height={352} rx={24} fill={color} />
        </Svg>
      );
    case 'reorder':
      // Six-dot grip, the conventional "drag me" affordance.
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
          <Circle cx={9} cy={6} r={1.6} fill={color} />
          <Circle cx={15} cy={6} r={1.6} fill={color} />
          <Circle cx={9} cy={12} r={1.6} fill={color} />
          <Circle cx={15} cy={12} r={1.6} fill={color} />
          <Circle cx={9} cy={18} r={1.6} fill={color} />
          <Circle cx={15} cy={18} r={1.6} fill={color} />
        </Svg>
      );
    case 'close':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M368 368 144 144M368 144 144 368" fill="none" stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'musical-notes':
      // Beamed pair of quavers: the Music tab's mark.
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
          <Path d="M8.9 4.6 20.5 2.6v3L8.9 7.6z" fill={color} />
          <Rect x={8.9} y={4.6} width={1.7} height={13} fill={color} />
          <Rect x={18.8} y={2.6} width={1.7} height={13} fill={color} />
          <Circle cx={6.6} cy={17.6} r={3.3} fill={color} />
          <Circle cx={16.5} cy={15.6} r={3.3} fill={color} />
        </Svg>
      );
    case 'shuffle':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="m400 304 48 48-48 48M400 112l48 48-48 48M64 352h85.19a80 80 0 0 0 66.56-35.62L256 256" fill="none" stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M64 160h85.19a80 80 0 0 1 66.56 35.62l80.5 120.76A80 80 0 0 0 362.81 352H416M416 160h-53.19a80 80 0 0 0-66.56 35.62L288 208" fill="none" stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'repeat':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="m320 120 48 48-48 48" fill="none" stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M352 168H144a80.24 80.24 0 0 0-80 80v16M192 392l-48-48 48-48" fill="none" stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M160 344h208a80.24 80.24 0 0 0 80-80v-16" fill="none" stroke={color} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'heart':
    case 'heart-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path
            d="M256 448a32 32 0 0 1-18-5.57c-78.59-53.35-112.62-89.93-131.39-112.8-40-48.75-59.15-98.8-58.61-153C48.63 114.52 98.46 64 159.08 64c44.08 0 74.61 24.83 92.39 45.51a6 6 0 0 0 9.06 0C278.31 88.81 308.84 64 352.92 64c60.62 0 110.45 50.52 111.08 112.64.54 54.21-18.63 104.26-58.61 153-18.77 22.87-52.8 59.45-131.39 112.8a32 32 0 0 1-18 5.56z"
            fill={name === 'heart' ? color : 'none'}
            stroke={color}
            strokeWidth={name === 'heart' ? 0 : 36}
          />
        </Svg>
      );
    default:
      return null;
  }
}
