import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { AppConfiguration } from '../../config';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpRepository } from './otp/otp.repository';
import { OtpService } from './otp/otp.service';
import { OtpCode, OtpCodeSchema } from './otp/schemas/otp-code.schema';
import { PhoneService } from './phone/phone.service';
import { ConsoleSmsProvider } from './sms/console-sms.provider';
import { SmsService } from './sms/sms.service';
import { SMS_PROVIDER, SmsProvider } from './sms/sms.types';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Authentication module (phone + OTP). Secrets and TTLs are supplied per
 * sign/verify call in {@link AuthService} (access vs refresh use different
 * secrets), so JwtModule is registered without global options.
 *
 * The active {@link SmsProvider} is selected from `SMS_PROVIDER` config; only the
 * console (dev) gateway is implemented today — add a class and a `case` to ship a
 * real one without touching any caller.
 */
@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: OtpCode.name, schema: OtpCodeSchema }]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PhoneService,
    OtpService,
    OtpRepository,
    SmsService,
    ConsoleSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, ConsoleSmsProvider],
      useFactory: (
        configService: ConfigService<AppConfiguration, true>,
        consoleProvider: ConsoleSmsProvider,
      ): SmsProvider => {
        const provider = configService.get('sms.provider', { infer: true });
        switch (provider) {
          case 'console':
            return consoleProvider;
          // case 'twilio': return twilioProvider;  // wire up when integrated
          // case 'msg91':  return msg91Provider;
          default:
            throw new Error(
              `SMS provider "${provider}" is not implemented yet. Set SMS_PROVIDER=console.`,
            );
        }
      },
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
