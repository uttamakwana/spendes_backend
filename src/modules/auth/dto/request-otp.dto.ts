import { PhoneNumberDto } from '../../../common/dto/phone-number.dto';

/**
 * Payload to request a one-time code. Just the phone identity — the same endpoint
 * serves both first-time (register) and returning (login) users.
 */
export class RequestOtpDto extends PhoneNumberDto {}
