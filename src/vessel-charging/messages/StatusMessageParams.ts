import BaseMessageParams from '../MessageParams';
import { ILocation } from '../../common-types';
/**
 * @class The Class vessel-charging/StatusMessageParams represent the parameters of vessel-charging consumer status message.
 */
export default class MessageParams extends BaseMessageParams {
  public static _messageType = 'vessel_status_message';
  public location: ILocation;

  constructor(values?: Partial<MessageParams>) {
    super(MessageParams._messageType, values);
    if (!!values) {
      if (!values.location) {
        throw new Error('location is a required field');
      }
      this.location = values.location;
    }
  }

  public serialize() {
    const formattedParams = super.serialize();
    Object.assign(formattedParams, {
      location: this.location,
    });
    return formattedParams;
  }

  public deserialize(json: any): void {
    super.deserialize(json);
    this.location = json.location;
  }
}
