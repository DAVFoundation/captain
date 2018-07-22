import IConfig from './IConfig';
import { ID } from './common-types';
import { MessageStatus, MessageDomain } from './common-enums';
import Bid from './Bid';
import Mission from './Mission';

export default class Message {
  // public bid: Bid;
  // public mission: Mission;
  // public status: MessageStatus;
  // public domain: MessageDomain;

    constructor(public selfId: ID, public peerId: ID, private config: IConfig) { /**/ }
    public async respond(type: string, payload: any) { /**/ }
}