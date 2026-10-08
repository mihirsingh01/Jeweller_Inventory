import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Headers,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { Public, Roles } from '../common/decorators';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsAppService: WhatsAppService) {}

  @Public()
  @Get('webhook')
  @ApiOperation({ summary: 'Meta WhatsApp webhook verification challenge' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'kumkum-verify-token';
    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Meta WhatsApp delivery receipt webhook receiver with signature verification' })
  async handleWebhook(
    @Headers('x-hub-signature-256') signature: string,
    @Req() req: Request,
    @Body() body: any,
  ) {
    // Signature verification if WHATSAPP_APP_SECRET is configured
    const rawBody = (req as any).rawBody || JSON.stringify(body);
    const isValid = this.whatsAppService.verifyWebhookSignature(signature, rawBody);
    if (!isValid) {
      throw new UnauthorizedException('Invalid X-Hub-Signature-256 signature');
    }

    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const statusObj = changes?.value?.statuses?.[0];

    if (statusObj) {
      const msgId = statusObj.id;
      const status = statusObj.status; // sent, delivered, read, failed
      await this.whatsAppService.handleWebhookStatus(msgId, status);
    }

    return { status: 'EVENT_RECEIVED' };
  }

  @Get('messages')
  @Roles('OWNER')
  @ApiOperation({ summary: 'List WhatsApp message logs and queue status (Owner only)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'recipient', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  getMessages(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('status') status?: string,
    @Query('recipient') recipient?: string,
  ) {
    return this.whatsAppService.getMessages(Number(limit), Number(offset), status, recipient);
  }

  @Get('outbox')
  @Roles('OWNER')
  @ApiOperation({ summary: 'List notification outbox rows with delivery status (Owner only, Req 4)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  getOutbox(
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
    @Query('status') status?: string,
  ) {
    return this.whatsAppService.getOutbox(Number(limit), Number(offset), status);
  }

  @Post('outbox/process')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Process pending items in notification outbox (Owner only)' })
  processOutbox(@Query('limit') limit = 20) {
    return this.whatsAppService.processPendingOutbox(Number(limit));
  }

  @Post('outbox/:id/retry')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Retry a failed notification outbox item (Owner only, Req 4)' })
  retryOutbox(@Param('id') id: string) {
    return this.whatsAppService.retryOutbox(Number(id));
  }
}
