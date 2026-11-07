const unitArtwork=[
 [/^нцп|навчальний центр/,'training'],
 [/^всп|^звп|військової поліції|військова служба правопорядку/,'police'],
 [/^ссо|nord division/,'nord'],
 [/^злп|логістичного призначення/,'logistics'],
 [/^оаз|авіаційний загін/,'aviation'],
 [/^старший склад/,'command'],
] as const;

export function unitCover(name:string){
 const normalized=name.trim().toLocaleLowerCase('uk-UA');
 const art=unitArtwork.find(([pattern])=>pattern.test(normalized))?.[1];
 return art?'/units/'+art+'.webp':undefined;
}
