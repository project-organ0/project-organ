export type SoundName = "start"|"dash"|"shot"|"hit"|"hurt"|"pickup"|"level"|"boss"|"heart"|"win"|"lose";

export function createSoundEngine(){
  let audio:AudioContext|null=null,muted=false;
  const last:Partial<Record<SoundName,number>>={};
  const play=(name:SoundName)=>{
    if(muted)return;
    const now=performance.now(),gaps:Partial<Record<SoundName,number>>={shot:85,hit:55,pickup:70,hurt:180};
    if(now-(last[name]??0)<(gaps[name]??0))return;last[name]=now;
    audio??=new AudioContext();if(audio.state==="suspended")void audio.resume();
    const tones:Record<SoundName,[number,number,number,"sine"|"square"|"sawtooth"|"triangle"]>={
      start:[180,360,.3,"sine"],dash:[420,110,.16,"sawtooth"],shot:[310,190,.07,"square"],
      hit:[95,55,.055,"square"],hurt:[150,62,.2,"sawtooth"],pickup:[520,920,.11,"sine"],
      level:[330,990,.42,"triangle"],boss:[72,42,.7,"sawtooth"],heart:[85,62,.28,"sine"],
      win:[380,1180,.75,"triangle"],lose:[180,48,.8,"sawtooth"],
    };
    const [from,to,duration,wave]=tones[name],osc=audio.createOscillator(),gain=audio.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(from,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),audio.currentTime+duration);
    gain.gain.setValueAtTime((name==="boss"||name==="hurt") ? .1 : .055,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);
    osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);
  };
  return {play,setMuted:(value:boolean)=>{muted=value;if(audio)void (value?audio.suspend():audio.resume())}};
}
