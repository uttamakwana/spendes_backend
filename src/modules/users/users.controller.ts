import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';
import {
  ApiPaginatedResponse,
  CurrentUser,
  PaginationQueryDto,
  ParseObjectIdPipe,
  ResponseMessage,
  Role,
  Roles,
} from '../../common';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  @ResponseMessage('Profile retrieved successfully')
  getMe(@CurrentUser('id') userId: string): Promise<UserResponseDto> {
    return this.usersService.findById(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @ApiOkResponse({ type: UserResponseDto })
  @ResponseMessage('Profile updated successfully')
  updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(userId, dto);
  }

  @Get()
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'List users (admin only)' })
  @ApiPaginatedResponse(UserResponseDto)
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Get a user by id (admin only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: UserResponseDto })
  findOne(@Param('id', ParseObjectIdPipe) id: Types.ObjectId): Promise<UserResponseDto> {
    return this.usersService.findById(id.toString());
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user by id (admin only)' })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id', ParseObjectIdPipe) id: Types.ObjectId): Promise<void> {
    return this.usersService.remove(id.toString());
  }
}
