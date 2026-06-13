-- Trigger: fire send-sms-alert when a service status changes to 'scheduled'

CREATE OR REPLACE FUNCTION public.handle_service_scheduled()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://knjdbgroiyhvqwrpqzcx.supabase.co/functions/v1/send-sms-alert',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtuamRiZ3JvaXlodnF3cnBxemN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0OTczMDMsImV4cCI6MjA5NTA3MzMwM30.zoExtkem-XZqU86S4yJjA_xOOaS1G0IPU2M9OAAza2g"}'::jsonb,
    body := jsonb_build_object(
      'alert_type', 'scheduled',
      'service_ids', jsonb_build_array(NEW.id),
      'user_id', NEW.user_id
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_service_status_scheduled ON "Services";
CREATE TRIGGER on_service_status_scheduled
  AFTER UPDATE ON "Services"
  FOR EACH ROW
  WHEN (NEW.status = 'scheduled' AND (OLD.status IS DISTINCT FROM 'scheduled'))
  EXECUTE FUNCTION public.handle_service_scheduled();
