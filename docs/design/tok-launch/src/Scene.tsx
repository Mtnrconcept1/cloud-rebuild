import {createContext, useContext, type CSSProperties, type ElementType, type ReactNode} from 'react';
import {splitSeconds} from './countdown';
import '@fontsource/anton/latin.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './scene.css';

export const WIDTH = 1672;
export const HEIGHT = 940;
// Native images in the live viewer; Remotion's loading-aware images during export.
export const ImageContext = createContext<ElementType>('img');
const rectangles = {
  tomato: [0, 0, 360, 365], grinder: [362, 0, 362, 386],
  pot: [724, 0, 362, 355], toque: [1086, 0, 362, 365],
  whisk: [0, 385, 362, 316], pan: [362, 385, 362, 310],
  basil: [724, 385, 362, 310], pepper: [1086, 375, 362, 326],
  pasta: [0, 699, 380, 387], sign: [395, 700, 336, 382],
  logo: [744, 702, 332, 384], chili: [1100, 718, 340, 330],
} as const;
export type SpriteName = keyof typeof rectangles;
function Sprite({name, width, assetBase}: {name: SpriteName; width: number; assetBase: string}) {
  const Image = useContext(ImageContext);
  const [x, y, w, h] = rectangles[name];
  const scale = width / w;
  return <div style={{width, height: h * scale, overflow: 'hidden', position: 'relative'}}>
    <Image src={`${assetBase}/props.png`} alt="" draggable={false}
      style={{position: 'absolute', width: 1448 * scale, maxWidth: 'none', height: 1086 * scale, left: -x * scale, top: -y * scale}}/>
  </div>;
}

type LayerProps = {x: number; y: number; depth: number; phase?: number; rotate?: number; time: number;
  pointer: {x: number; y: number}; reducedMotion: boolean; children: ReactNode; className?: string; style?: CSSProperties};
function Layer({x, y, depth, phase = 0, rotate = 0, time, pointer, reducedMotion, children, className, style}: LayerProps) {
  const drift = reducedMotion ? 0 : Math.sin(time * .55 + phase) * depth;
  const vertical = reducedMotion ? 0 : Math.sin(time * .8 + phase) * depth * .7;
  const tilt = reducedMotion ? rotate : rotate + Math.sin(time * .45 + phase) * depth * .12;
  return <div className={className} style={{position: 'absolute', left: x, top: y,
    transform: `translate3d(${drift + (reducedMotion ? 0 : pointer.x * depth)}px, ${vertical + (reducedMotion ? 0 : pointer.y * depth)}px, 0) rotate(${tilt}deg)`, ...style}}>{children}</div>;
}
const props: {name: SpriteName; x: number; y: number; width: number; depth: number; rotate?: number}[] = [
  {name: 'toque', x: 62, y: 5, width: 115, depth: 11, rotate: -16},
  {name: 'pot', x: 292, y: 4, width: 146, depth: 15, rotate: -9},
  {name: 'pan', x: 757, y: 146, width: 187, depth: 13, rotate: -12},
  {name: 'basil', x: 866, y: 13, width: 135, depth: 18, rotate: -18},
  {name: 'grinder', x: 166, y: 97, width: 138, depth: 17, rotate: 5},
  {name: 'whisk', x: 65, y: 291, width: 192, depth: 12, rotate: -25},
  {name: 'tomato', x: 14, y: 139, width: 133, depth: 22, rotate: -14},
  {name: 'basil', x: -20, y: 323, width: 95, depth: 22, rotate: 35},
  {name: 'pepper', x: 864, y: 510, width: 99, depth: 12, rotate: 12},
  {name: 'chili', x: 623, y: 607, width: 88, depth: 14, rotate: 22},
];
export type SceneProps = {time: number; remaining: number; previousRemaining?: number; tickProgress?: number;
  assetBase: string; pointer?: {x: number; y: number}; reducedMotion?: boolean};
export function Scene({time, remaining, previousRemaining = remaining, tickProgress = 1, assetBase,
  pointer = {x: 0, y: 0}, reducedMotion = false}: SceneProps) {
  const Image = useContext(ImageContext);
  const common = {time, pointer, reducedMotion};
  const numbers = splitSeconds(remaining);
  const previous = splitSeconds(previousRemaining);
  const labels = ['JOURS', 'HEURES', 'MINUTES', 'SECONDES'];
  const flip = reducedMotion ? 1 : Math.min(1, tickProgress / .32);
  return <div className="tok-scene" role="img" aria-label={`TOK. Merci pour votre inscription. Lancement dans ${numbers[0]} jours, ${numbers[1]} heures, ${numbers[2]} minutes et ${numbers[3]} secondes.`}>
    <Layer {...common} x={-35} y={-22} depth={-5}>
      <Image src={`${assetBase}/background.png`} alt="" style={{width: 1742, height: 984}}/>
    </Layer>
    <div className="light-bloom" style={{opacity: .12 + (reducedMotion ? 0 : Math.sin(time * .5) * .05)}}/>
    {props.map((item, index) => <Layer {...common} key={`${item.name}-${index}`} {...item} phase={index * 1.3} className="prop">
      <Sprite name={item.name} width={item.width} assetBase={assetBase}/>
    </Layer>)}
    <Layer {...common} x={88} y={24} depth={8} phase={.4} className="chef-layer">
      <Image src={`${assetBase}/chef.png`} alt="" style={{width: 751, height: 901,
        transform: `rotate(${reducedMotion ? 0 : Math.sin(time * 2.4) * .6}deg)`, transformOrigin: '50% 65%'}}/>
    </Layer>
    <Layer {...common} x={-1} y={563} depth={5} rotate={-3}>
      <Sprite name="sign" width={293} assetBase={assetBase}/>
      <div className="sign-copy">GRAND<br/>LANCEMENT<strong>480H</strong></div>
    </Layer>
    <Layer {...common} x={681} y={558} depth={5} phase={2}>
      <div className="speech">J’AI DÉJÀ MIS<br/>LA TOQUE.<br/>MAINTENANT,<br/>J’ATTENDS JUSTE<br/>QUE LE FOUR<br/>SONNE.</div>
    </Layer>
    <Layer {...common} x={568} y={766} depth={21} phase={1.4} rotate={-12} className="prop">
      <Sprite name="pasta" width={205} assetBase={assetBase}/>
    </Layer>
    <Layer {...common} x={195} y={782} depth={23} phase={3} rotate={17}>
      <Sprite name="basil" width={99} assetBase={assetBase}/>
    </Layer>
    <Layer {...common} x={1209} y={19} depth={2}>
      <Sprite name="logo" width={180} assetBase={assetBase}/>
    </Layer>
    <div className="message">
      <div className="title" style={{transform: `translateY(${reducedMotion ? 0 : Math.max(0, 1 - time * 2.4) ** 3 * 20}px)`}}>MERCI POUR</div>
      <div className="title title-orange">VOTRE INSCRIPTION !</div>
      <p>Vous êtes officiellement dans la file d’attente<br/>la plus savoureuse de Suisse.<br/>
        Le grand lancement de TOK approche.</p>
    </div>
    <div className="countdown" aria-hidden="true">
      {numbers.map((number, index) => <div className="counter" key={labels[index]}>
        <div className="digits-window">
          {previous[index] !== number && flip < 1 && <span className="digits digits-old" style={{transform: `translateY(${-flip * 110}%)`, opacity: 1 - flip}}>{String(previous[index]).padStart(2, '0')}</span>}
          <span className="digits" style={{transform: `translateY(${previous[index] !== number ? (1 - flip) * 110 : 0}%)`}}>{String(number).padStart(2, '0')}</span>
        </div>
        <span className="unit">{labels[index]}</span>
      </div>)}
    </div>
    <div className="ribbon"><span>♡</span>{remaining <= 0 ? 'LE GRAND JOUR EST ARRIVÉ !' : 'GARDEZ L’APPÉTIT, ÇA ARRIVE.'}<span>♡</span></div>
    {!reducedMotion && <div className="dust" aria-hidden="true">{Array.from({length: 18}, (_, i) => {
      const t = (time * (14 + i % 4 * 7) + i * 89) % 970;
      return <i key={i} style={{left: t, top: 75 + (i * 137) % 770, opacity: .12 + i % 3 * .08,
        transform: `rotate(${time * 30 + i * 17}deg)`, width: 3 + i % 4, height: 3 + i % 5}}/>;
    })}</div>}
  </div>;
}
