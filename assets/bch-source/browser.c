#include "bch.h"
#include <stdint.h>
static struct bch_control *codec;
static uint8_t packet[12];
uint8_t *get_packet(void){return packet;}
int decode_packet(void){
 if(!codec)codec=bch_init(7,5,137,false);
 if(!codec)return -2;
 unsigned int positions[5];
 int flips=bch_decode(codec,packet,7,packet+7,0,0,positions);
 if(flips<0)return -1;
 for(int i=0;i<flips;i++){
  if(positions[i]>=96)return -1;
  packet[positions[i]/8]^=1u<<(positions[i]&7);
 }
 return flips;
}
